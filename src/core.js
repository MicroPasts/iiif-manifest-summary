const MANIFEST_CACHE = new Map();
const IN_FLIGHT = new Map();

function pickLangValue(val, preferredLang = 'en') {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) {
    const parts = val.map((v) => pickLangValue(v, preferredLang)).filter(Boolean);
    return parts.join(' · ');
  }
  if (typeof val === 'object') {
    // IIIF v3 language map: { en: ["Title"], none: ["..."] }
    if (val[preferredLang]) return pickLangValue(val[preferredLang], preferredLang);
    if (val.none) return pickLangValue(val.none, preferredLang);
    const firstKey = Object.keys(val)[0];
    if (firstKey && Array.isArray(val[firstKey])) {
      return pickLangValue(val[firstKey], preferredLang);
    }
    if (typeof val['@value'] === 'string') return val['@value'].trim();
    if (typeof val.value === 'string') return val.value.trim();
  }
  return '';
}

export function stripHtml(value) {
  const input = String(value ?? '');
  if (!input) return '';

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    doc.querySelectorAll('p, div, li').forEach((node) => node.append(' '));
    return (doc.body.textContent || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, dec) =>
      String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatRightsLabel(rights) {
  const value = String(rights || '').trim();
  if (!value || value === 'Not specified' || value === 'Unavailable') return value || 'Not specified';

  const ccPublicDomain = value.match(/creativecommons\.org\/publicdomain\/mark(?:\/)?(?:([0-9.]+))?/i);
  if (ccPublicDomain) return 'Public Domain Mark';

  const ccZero = value.match(/creativecommons\.org\/publicdomain\/zero\/([0-9.]+)/i);
  if (ccZero) return `CC0 ${ccZero[1]}`;
  if (/creativecommons\.org\/publicdomain\/zero/i.test(value)) return 'CC0';

  const ccLicense = value.match(/creativecommons\.org\/licenses\/(?:cc-)?(by(?:-nc|-nd|-sa|-nc-sa|-nc-nd)?|zero)\/([0-9.]+)/i);
  if (ccLicense) {
    const code = ccLicense[1].toUpperCase();
    const version = ccLicense[2];
    if (code === 'ZERO') return `CC0 ${version}`;
    return `CC ${code} ${version}`;
  }

  const rightsStatement = value.match(/rightsstatements\.org\/vocab\/([^/]+)\/([0-9.]+)/i);
  if (rightsStatement) {
    const labels = {
      'InC': 'In Copyright',
      'InC-EDU': 'In Copyright - Educational Use',
      'InC-NC': 'In Copyright - Non-Commercial Use',
      'InC-RUU': 'In Copyright - Rights-holder(s) Unlocatable or Unidentifiable',
      'InC-OW-EU': 'In Copyright - EU Orphan Work',
      'NoC-NC': 'No Copyright - Non-Commercial Use',
      'NoC-OKLR': 'No Copyright - Other Known Legal Restrictions',
      'NoC-US': 'No Copyright - United States',
      'NKC': 'No Known Copyright',
      'UND': 'Copyright Undetermined',
    };
    const code = rightsStatement[1];
    return labels[code] || code.replaceAll('-', ' ');
  }

  return value;
}

function extractThumbnail(manifest) {
  // IIIF v3 thumbnail array/object
  if (manifest.thumbnail) {
    const t = Array.isArray(manifest.thumbnail) ? manifest.thumbnail[0] : manifest.thumbnail;
    if (typeof t === 'string') return t;
    if (t?.id) return t.id;
    if (t['@id']) return t['@id'];
  }
  // IIIF v2 thumbnail
  if (manifest.sequences?.[0]?.canvases?.[0]?.thumbnail) {
    const t2 = manifest.sequences[0].canvases[0].thumbnail;
    if (typeof t2 === 'string') return t2;
    if (t2['@id']) return t2['@id'];
    if (t2.id) return t2.id;
  }
  // IIIF v3 first item thumbnail
  const firstCanvas = manifest.items?.[0];
  if (firstCanvas?.thumbnail) {
    const tc = Array.isArray(firstCanvas.thumbnail) ? firstCanvas.thumbnail[0] : firstCanvas.thumbnail;
    if (tc?.id) return tc.id;
    if (tc['@id']) return tc['@id'];
  }
  return null;
}

function extractCanvasCount(manifest) {
  if (Array.isArray(manifest.items)) {
    return manifest.items.filter((i) => i?.type === 'Canvas').length || manifest.items.length;
  }
  if (Array.isArray(manifest.sequences?.[0]?.canvases)) {
    return manifest.sequences[0].canvases.length;
  }
  return 0;
}

function extractMetadata(manifest) {
  if (!Array.isArray(manifest.metadata)) return [];
  return manifest.metadata
    .slice(0, 4)
    .map((entry) => ({
      label: stripHtml(pickLangValue(entry.label)) || 'Field',
      value: stripHtml(pickLangValue(entry.value)) || '',
    }))
    .filter((m) => m.value);
}

/**
 * Normalize a raw IIIF v2 or v3 manifest JSON object into a compact summary.
 */
export function summarizeManifest(manifest, manifestUri = '') {
  const isV3 =
    String(manifest?.['@context'] || '').includes('/presentation/3/') ||
    Array.isArray(manifest?.items);

  const version = isV3 ? 'IIIF v3' : 'IIIF v2';
  const rawLabel =
    pickLangValue(manifest?.label) ||
    manifest?.['@id'] ||
    manifest?.id ||
    manifestUri ||
    'Untitled Manifest';
  const label = stripHtml(rawLabel);

  const summary =
    pickLangValue(manifest?.summary) ||
    pickLangValue(manifest?.description) ||
    '';
  const plainSummary = stripHtml(summary);
  const summaryCharacters = Array.from(plainSummary);
  const summaryStart = summaryCharacters.slice(0, 219).join('');
  const lastWordBoundary = summaryStart.search(/\s+\S*$/);
  const compactSummary =
    summaryCharacters.length > 220
      ? `${(lastWordBoundary >= 110 ? summaryStart.slice(0, lastWordBoundary) : summaryStart).trimEnd()}…`
      : plainSummary;

  const rights =
    manifest?.rights ||
    pickLangValue(manifest?.license) ||
    'Not specified';

  const thumbnail = extractThumbnail(manifest || {});
  const canvasCount = extractCanvasCount(manifest || {});
  const metadata = extractMetadata(manifest || {});

  return {
    uri: manifest?.id || manifest?.['@id'] || manifestUri,
    version,
    label,
    summary: compactSummary,
    fullSummary: plainSummary,
    rights,
    rightsLabel: formatRightsLabel(rights),
    thumbnail,
    canvasCount,
    metadata,
  };
}

export function seedManifest(uri, manifestJson) {
  MANIFEST_CACHE.set(uri, summarizeManifest(manifestJson, uri));
}

export function clearManifestCache() {
  MANIFEST_CACHE.clear();
}

export async function fetchManifestSummary(uri) {
  if (!uri) return null;
  if (MANIFEST_CACHE.has(uri)) return MANIFEST_CACHE.get(uri);
  if (IN_FLIGHT.has(uri)) return IN_FLIGHT.get(uri);

  const promise = fetch(uri, { headers: { Accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const summary = summarizeManifest(json, uri);
      MANIFEST_CACHE.set(uri, summary);
      IN_FLIGHT.delete(uri);
      return summary;
    })
    .catch((err) => {
      IN_FLIGHT.delete(uri);
      return {
        uri,
        version: 'IIIF',
        label: uri,
        summary: `Unable to load manifest (${err?.message || 'CORS or network error'}).`,
        fullSummary: `Unable to load manifest (${err?.message || 'CORS or network error'}).`,
        rights: 'Unavailable',
        rightsLabel: 'Unavailable',
        thumbnail: null,
        canvasCount: 0,
        metadata: [],
        error: true,
      };
    });

  IN_FLIGHT.set(uri, promise);
  return promise;
}

export function emitManifestSelect(target, data) {
  if (!data) return;
  target.dispatchEvent(
    new CustomEvent('heritage:select', {
      bubbles: true,
      composed: true,
      detail: {
        uri: data.uri,
        label: data.label,
        canvasCount: data.canvasCount,
        version: data.version,
      },
    })
  );
}

export async function copyTextToClipboard(text) {
  const value = String(text ?? '').trim();
  if (!value) return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}