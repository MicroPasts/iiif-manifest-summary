/**
 * @micropasts/iiif-manifest-summary v0.1.4
 * Zero-dependency IIIF Presentation v2/v3 summary Web Components
 * License: MIT
 */

// --- core.js ---
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

// --- shadow.js ---
let globalTemplate = null;

export class IiifManifestSummary extends HTMLElement {
  static get observedAttributes() {
    return ['manifest', 'listen'];
  }

  static setTemplate(fn) {
    globalTemplate = fn;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this.template = null;
    this._onExternalSelect = this._onExternalSelect.bind(this);
  }

  connectedCallback() {
    const url = this.getAttribute('manifest');
    if (url) this.load(url);

    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.addEventListener(listenEvent, this._onExternalSelect);
    }
  }

  disconnectedCallback() {
    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.removeEventListener(listenEvent, this._onExternalSelect);
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this.isConnected) return;
    if (name === 'manifest' && newVal) {
      this.load(newVal);
    }
  }

  _onExternalSelect(e) {
    if (e.detail?.manifest) {
      this.setAttribute('manifest', e.detail.manifest);
      this.load(e.detail.manifest);
    }
  }

  async load(url) {
    this._renderLoading();
    this._data = await fetchManifestSummary(url);
    this._renderData();
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _renderLoading() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, -apple-system, sans-serif; }
        .box { padding: 14px; border: 1px solid #e4e4e7; border-radius: 0.5rem; font-size: 12px; color: #71717a; }
      </style>
      <div class="box">Loading IIIF manifest summary…</div>
    `;
  }

  _renderData() {
    const d = this._data;
    if (!d) return;

    const customFn = this.template || globalTemplate;
    if (typeof customFn === 'function') {
      this.shadowRoot.innerHTML = customFn(d, this._esc.bind(this));
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --iiif-bg: #ffffff;
          --iiif-fg: #18181b;
          --iiif-muted: #52525b;
          --iiif-border: #e4e4e7;
          --iiif-surface: rgba(127, 127, 127, 0.08);
          --iiif-accent: #0284c7;
          --iiif-radius: 0.5rem;
          --iiif-font: system-ui, -apple-system, sans-serif;

          display: block;
          font-family: var(--iiif-font);
          color: var(--iiif-fg);
        }

        @media (prefers-color-scheme: dark) {
          :host(:not([theme="light"])) {
            --iiif-bg: #18181b;
            --iiif-fg: #f4f4f5;
            --iiif-muted: #a1a1aa;
            --iiif-border: #3f3f46;
          }
        }

        :host([theme="dark"]) {
          --iiif-bg: #18181b;
          --iiif-fg: #f4f4f5;
          --iiif-muted: #a1a1aa;
          --iiif-border: #3f3f46;
        }

        .card {
          background: var(--iiif-bg);
          color: var(--iiif-fg);
          border: 1px solid var(--iiif-border);
          border-radius: var(--iiif-radius);
          padding: 14px;
        }

        .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
        .badge { background: var(--iiif-accent); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
        .canvases { font-size: 11px; color: var(--iiif-muted); font-family: ui-monospace, monospace; }
        .body { display: flex; gap: 12px; align-items: flex-start; }
        .thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 4px; flex-shrink: 0; border: 1px solid var(--iiif-border); }
        .title { font-weight: 700; font-size: 15px; line-height: 1.3; }
        .summary { margin: 8px 0; font-size: 12.5px; line-height: 1.45; color: var(--iiif-fg); }
        .summary-toggle { margin-top: -4px; }
        .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; margin: 8px 0; padding: 8px; border-radius: 4px; background: var(--iiif-surface); font-size: 11px; }
        .meta span { display: block; color: var(--iiif-muted); }
        .footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--iiif-border); padding-top: 8px; margin-top: 8px; font-size: 11px; }
        .rights { display: inline-block; max-width: 100%; box-sizing: border-box; padding: 2px 6px; border: 1px solid var(--iiif-border); border-radius: 4px; background: var(--iiif-surface); color: var(--iiif-fg); font-weight: 500; overflow-wrap: anywhere; }
        .btns { display: flex; gap: 6px; }
        button { font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--iiif-border); background: transparent; color: inherit; cursor: pointer; }
        button:hover { background: var(--iiif-surface); }
        .thumb-button { padding: 0; border: 0; background: transparent; border-radius: 4px; }
        .thumb-button:hover { background: transparent; }
        .lightbox {
          width: min(90vw, 900px);
          max-height: 90vh;
          padding: 12px;
          border: 1px solid var(--iiif-border);
          border-radius: var(--iiif-radius);
          background: var(--iiif-bg);
          color: var(--iiif-fg);
        }
        .lightbox::backdrop { background: rgba(0, 0, 0, 0.78); }
        .lightbox-close { float: right; margin-bottom: 8px; }
        .lightbox-image { display: block; width: 100%; max-height: calc(90vh - 52px); object-fit: contain; }
      </style>
      <div part="card" class="card">
        <div part="header" class="top">
          <span part="badge" class="badge">${this._esc(d.version)}</span>
          <span part="canvases" class="canvases">${d.canvasCount} canvas(es)</span>
        </div>
        <div class="body">
          ${d.thumbnail ? `<button type="button" class="thumb-button" data-open-lightbox aria-label="View larger thumbnail"><img part="thumb" class="thumb" src="${this._esc(d.thumbnail)}" alt=""></button>` : ''}
          <div>
            <div part="title" class="title">${this._esc(d.label)}</div>
          </div>
        </div>
        ${d.summary ? `<p part="summary" class="summary">${this._esc(d.summary)}</p>` : ''}
        ${d.fullSummary && d.fullSummary !== d.summary ? '<button type="button" class="summary-toggle" aria-expanded="false">Read more</button>' : ''}
        ${
          d.metadata?.length
            ? `<div part="meta" class="meta">${d.metadata
                .map((m) => `<div><span>${this._esc(m.label)}</span><strong>${this._esc(m.value)}</strong></div>`)
                .join('')}</div>`
            : ''
        }
        <div class="footer">
          <span part="rights" class="rights" title="${this._esc(d.rights)}">Rights: ${this._esc(d.rightsLabel || d.rights)}</span>
          <div class="btns">
            <button type="button" class="copy-uri" data-uri="${this._esc(d.uri)}">Copy URI</button>
            <button type="button" class="select-btn">Inspect</button>
          </div>
        </div>
      </div>
      ${d.thumbnail ? `<dialog class="lightbox" aria-label="Larger manifest thumbnail">
        <button type="button" class="lightbox-close" data-close-lightbox aria-label="Close">Close</button>
        <img class="lightbox-image" src="${this._esc(d.thumbnail)}" alt="${this._esc(d.label)}">
      </dialog>` : ''}
    `;

    this.shadowRoot.querySelector('.summary-toggle')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      this.shadowRoot.querySelector('.summary').textContent = expanded ? d.summary : d.fullSummary;
      button.setAttribute('aria-expanded', String(!expanded));
      button.textContent = expanded ? 'Read more' : 'Read less';
    });

    const lightbox = this.shadowRoot.querySelector('.lightbox');
    this.shadowRoot.querySelector('[data-open-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.showModal === 'function') lightbox.showModal();
      else lightbox?.setAttribute('open', '');
    });
    this.shadowRoot.querySelector('[data-close-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.close === 'function') lightbox.close();
      else lightbox?.removeAttribute('open');
    });
    lightbox?.addEventListener('click', (event) => {
      if (event.target === lightbox) {
        if (typeof lightbox.close === 'function') lightbox.close();
        else lightbox.removeAttribute('open');
      }
    });

    this.shadowRoot.querySelector('.copy-uri')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const ok = await copyTextToClipboard(btn.getAttribute('data-uri') || '');
      if (ok) {
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = 'Copy URI';
        }, 1200);
      }
    });

    this.shadowRoot.querySelector('.select-btn')?.addEventListener('click', () => {
      emitManifestSelect(this, d);
    });
  }
}

if (!customElements.get('iiif-manifest-summary')) {
  customElements.define('iiif-manifest-summary', IiifManifestSummary);
}

// --- tailwind.js ---
export class IiifManifestSummaryTailwind extends HTMLElement {
  static classes = {
    card:
      'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-zinc-900 dark:text-zinc-100',
    btn:
      'rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors',
  };

  constructor() {
    super();
    this._data = null;
    this._initialized = false;
    this._onExternalSelect = this._onExternalSelect.bind(this);
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    const url = this.getAttribute('manifest');
    if (url) this.load(url);

    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.addEventListener(listenEvent, this._onExternalSelect);
    }
  }

  disconnectedCallback() {
    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.removeEventListener(listenEvent, this._onExternalSelect);
    }
  }

  _onExternalSelect(e) {
    if (e.detail?.manifest) {
      this.setAttribute('manifest', e.detail.manifest);
      this.load(e.detail.manifest);
    }
  }

  async load(url) {
    const c = IiifManifestSummaryTailwind.classes;
    this.innerHTML = `<div class="${c.card} text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">Loading IIIF manifest summary…</div>`;
    this._data = await fetchManifestSummary(url);
    this._renderData();
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _renderData() {
    const d = this._data;
    if (!d) return;
    const c = IiifManifestSummaryTailwind.classes;
    const cardClass = `${c.card} ${this.getAttribute('card-class') || ''}`.trim();

    this.innerHTML = `
      <div class="${cardClass}">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="inline-flex items-center rounded bg-sky-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">${this._esc(d.version)}</span>
          <span class="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">${d.canvasCount} canvas(es)</span>
        </div>

        <div class="flex items-start gap-3">
          ${d.thumbnail ? `<button type="button" data-open-lightbox aria-label="View larger thumbnail" class="shrink-0 rounded border-0 p-0">
            <img src="${this._esc(d.thumbnail)}" alt="" class="h-14 w-14 rounded object-cover border border-zinc-200 dark:border-zinc-700">
          </button>` : ''}
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">${this._esc(d.label)}</h3>
          </div>
        </div>

        ${d.summary ? `<p class="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">${this._esc(d.summary)}</p>` : ''}
        ${d.fullSummary && d.fullSummary !== d.summary ? `<button type="button" data-iiif-summary-toggle aria-expanded="false" class="${c.btn} mt-1">Read more</button>` : ''}

        ${
          d.metadata?.length
            ? `<div class="mt-2.5 grid grid-cols-2 gap-2 rounded-md bg-zinc-50 dark:bg-zinc-950/70 p-2 text-xs border border-zinc-200/70 dark:border-zinc-800">${d.metadata
                .map(
                  (m) =>
                    `<div><span class="block text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">${this._esc(m.label)}</span><strong class="font-medium text-zinc-900 dark:text-zinc-100">${this._esc(m.value)}</strong></div>`
                )
                .join('')}</div>`
            : ''
        }

        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-2 text-[11px]">
          <span class="inline-block max-w-full break-words rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-medium text-zinc-800 dark:text-zinc-200" title="${this._esc(d.rights)}">Rights: ${this._esc(d.rightsLabel || d.rights)}</span>
          <div class="flex items-center gap-1.5">
            <button type="button" data-iiif-copy data-uri="${this._esc(d.uri)}" class="${c.btn}">Copy URI</button>
            <button type="button" data-iiif-select class="${c.btn}">Inspect</button>
          </div>
        </div>
      </div>
      ${d.thumbnail ? `<dialog data-iiif-lightbox aria-label="Larger manifest thumbnail" class="w-[min(90vw,900px)] max-h-[90vh] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-zinc-900 dark:text-zinc-100 backdrop:bg-black/75">
        <button type="button" data-close-lightbox aria-label="Close" class="${c.btn} float-right mb-2">Close</button>
        <img src="${this._esc(d.thumbnail)}" alt="${this._esc(d.label)}" class="block h-auto max-h-[calc(90vh-52px)] w-full object-contain">
      </dialog>` : ''}
    `;

    this.querySelector('[data-iiif-summary-toggle]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.previousElementSibling.textContent = expanded ? d.summary : d.fullSummary;
      button.setAttribute('aria-expanded', String(!expanded));
      button.textContent = expanded ? 'Read more' : 'Read less';
    });

    const lightbox = this.querySelector('[data-iiif-lightbox]');
    this.querySelector('[data-open-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.showModal === 'function') lightbox.showModal();
      else lightbox?.setAttribute('open', '');
    });
    this.querySelector('[data-close-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.close === 'function') lightbox.close();
      else lightbox?.removeAttribute('open');
    });
    lightbox?.addEventListener('click', (event) => {
      if (event.target === lightbox) {
        if (typeof lightbox.close === 'function') lightbox.close();
        else lightbox.removeAttribute('open');
      }
    });

    this.querySelector('[data-iiif-copy]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const ok = await copyTextToClipboard(btn.getAttribute('data-uri') || '');
      if (ok) {
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = 'Copy URI';
        }, 1200);
      }
    });

    this.querySelector('[data-iiif-select]')?.addEventListener('click', () => {
      emitManifestSelect(this, d);
    });
  }
}

if (!customElements.get('iiif-manifest-summary-tw')) {
  customElements.define('iiif-manifest-summary-tw', IiifManifestSummaryTailwind);
}
