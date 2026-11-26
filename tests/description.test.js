import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeManifest, clearManifestCache, fetchManifestSummary } from '../src/core.js';

const longText = `${'A description of the object. '.repeat(15)}The end & more.`;

test('normalizes short and long v2 and v3 descriptions', () => {
  for (const manifest of [
    { description: `<p>${longText}</p>` },
    { summary: { en: [`<p>${longText}</p>`] }, items: [] },
  ]) {
    const result = summarizeManifest(manifest);
    assert.equal(result.fullSummary, longText);
    assert.ok(Array.from(result.summary).length <= 220);
    assert.match(result.summary, /…$/);
    assert.ok(longText.startsWith(result.summary.slice(0, -1)));
    assert.match(longText[result.summary.length - 1], /\s/);
  }
  const short = summarizeManifest({ description: 'Short description' });
  assert.equal(short.summary, 'Short description');
  assert.equal(short.fullSummary, short.summary);
  const boundary = summarizeManifest({ description: 'x'.repeat(220) });
  assert.equal(boundary.summary, boundary.fullSummary);
  const unicode = summarizeManifest({ description: '😀'.repeat(221) });
  assert.equal(Array.from(unicode.summary).length, 220);
  assert.equal(unicode.summary, `${'😀'.repeat(219)}…`);
});

test('fetch errors expose the complete error summary', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    clearManifestCache();
    const result = await fetchManifestSummary('https://example.org/missing');
    assert.equal(result.fullSummary, result.summary);
    assert.equal(result.error, true);
  } finally {
    globalThis.fetch = originalFetch;
    clearManifestCache();
  }
});

class MockRoot {
  constructor() {
    this.summary = { textContent: '' };
    this.inspect = {
      style: {},
      addEventListener(type, listener) { this.listener = listener; },
    };
    this.copy = {
      style: {},
      addEventListener(type, listener) { this.listener = listener; },
    };
    this.toggle = {
      attributes: { 'aria-expanded': 'false' },
      getAttribute(name) { return this.attributes[name]; },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(type, listener) { this.listener = listener; },
      previousElementSibling: this.summary,
    };
  }

  querySelector(selector) {
    if (selector === '.summary') return this.summary;
    if (selector === '.select-btn' || selector === '[data-iiif-select]') return this.inspect;
    if (selector === '.copy-uri' || selector === '[data-iiif-copy]') return this.copy;
    if (selector === '.summary-toggle' || selector === '[data-iiif-summary-toggle]') {
      return this.innerHTML.includes('aria-expanded="false"') ? this.toggle : null;
    }
    return null;
  }
}

globalThis.HTMLElement = class extends MockRoot {
  attachShadow() { this.shadowRoot = new MockRoot(); }
  getAttribute() { return null; }
  hasAttribute() { return false; }
};
globalThis.customElements = { get() {}, define() {} };
const { IiifManifestSummary } = await import('../src/shadow.js');
const { IiifManifestSummaryTailwind } = await import('../src/tailwind-component.js');

for (const Component of [IiifManifestSummary, IiifManifestSummaryTailwind]) {
  test(`${Component.name} expands and collapses a long description`, () => {
    const component = new Component();
    const root = component.shadowRoot || component;
    component._data = summarizeManifest({ description: longText });
    component._renderData();
    assert.match(root.innerHTML, /Read more/);
    const button = root.toggle;
    button.listener({ currentTarget: button });
    assert.equal(root.summary.textContent, longText);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(button.textContent, 'Read less');
    button.listener({ currentTarget: button });
    assert.equal(root.summary.textContent, component._data.summary);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.textContent, 'Read more');
  });

  test(`${Component.name} renders short descriptions without a toggle`, () => {
    const component = new Component();
    const root = component.shadowRoot || component;
    component._data = summarizeManifest({ description: 'Short & sweet' });
    component._renderData();
    assert.match(root.innerHTML, /Short &amp; sweet/);
    assert.doesNotMatch(root.innerHTML, /Read more/);
  });

  test(`${Component.name} renders an escaped rights badge with the original URI`, () => {
    const component = new Component();
    const root = component.shadowRoot || component;
    component._data = summarizeManifest({
      rights: 'http://creativecommons.org/licenses/cc-by/4.0/?source=a&other=b',
    });
    component._renderData();
    assert.match(root.innerHTML, /title="http:\/\/creativecommons\.org\/licenses\/cc-by\/4\.0\/\?source=a&amp;other=b">Rights: CC BY 4\.0<\/span>/);
    if (component.shadowRoot) {
      assert.match(root.innerHTML, /<span part="rights" class="rights"/);
    } else {
      assert.match(root.innerHTML, /<span class="inline-block max-w-full break-words rounded border /);
    }
  });

  test(`${Component.name} supports hiding and restoring Inspect without rerendering`, () => {
    const component = new Component();
    const root = component.shadowRoot || component;
    component._data = summarizeManifest({ label: 'Test' });
    component._renderData();
    assert.match(root.innerHTML, />Inspect<\/button>/);
    assert.doesNotMatch(root.innerHTML, /hidden style="display: none"/);
    assert.equal(typeof root.inspect.listener, 'function');

    component.isConnected = true;
    component.attributeChangedCallback('hide-inspect', null, '');
    assert.equal(root.inspect.hidden, true);
    assert.equal(root.inspect.style.display, 'none');
    component.attributeChangedCallback('hide-inspect', '', null);
    assert.equal(root.inspect.hidden, false);
    assert.equal(root.inspect.style.display, '');
    assert.equal(typeof root.inspect.listener, 'function');

    component.hasAttribute = (name) => name === 'hide-inspect';
    component._renderData();
    assert.match(root.innerHTML, /hidden style="display: none">Inspect<\/button>/);
  });

  test(`${Component.name} supports separate Copy URI visibility`, () => {
    const component = new Component();
    const root = component.shadowRoot || component;
    component._data = summarizeManifest({ label: 'Test' });
    component._renderData();
    component.isConnected = true;
    component.attributeChangedCallback('hide-copy', null, '');
    assert.equal(root.copy.hidden, true);
    assert.equal(root.copy.style.display, 'none');
    assert.notEqual(root.inspect.hidden, true);
    component.attributeChangedCallback('hide-copy', '', null);
    assert.equal(root.copy.hidden, false);
    assert.equal(root.copy.style.display, '');
    component.hasAttribute = (name) => name === 'hide-copy';
    component._renderData();
    assert.match(root.innerHTML, /hidden style="display: none">Copy URI<\/button>/);
  });

  test(`${Component.name} filters sections and metadata beyond the default four`, () => {
    const component = new Component();
    const root = component.shadowRoot || component;
    const metadata = ['Artist', 'Date', 'Material', 'Location', 'Shelfmark'].map((label) => ({ label, value: `${label} value` }));
    component._data = summarizeManifest({
      label: 'Test title', summary: 'Test description', rights: 'Test rights',
      thumbnail: { id: 'https://example.org/thumb.jpg' }, metadata,
    });
    assert.equal(component._data.metadata.length, 4);
    const attributes = { fields: 'label, metadata', 'metadata-fields': 'shelfmark, ARTIST' };
    component.getAttribute = (name) => attributes[name] ?? null;
    component._renderData();
    assert.match(root.innerHTML, /Test title/);
    assert.match(root.innerHTML, /Artist value/);
    assert.match(root.innerHTML, /Shelfmark value/);
    assert.doesNotMatch(root.innerHTML, /Date value|Test description|Test rights|thumb\.jpg|canvas\(es\)/);
    component.isConnected = true;
    attributes.fields = 'summary';
    component.attributeChangedCallback('fields', 'label, metadata', 'summary');
    assert.match(root.innerHTML, /Test description/);
    assert.doesNotMatch(root.innerHTML, /Test title|Shelfmark value/);
    delete attributes.fields;
    delete attributes['metadata-fields'];
    component.attributeChangedCallback('fields', 'summary', null);
    assert.match(root.innerHTML, /Test title/);
    assert.match(root.innerHTML, /Artist value/);
    assert.doesNotMatch(root.innerHTML, /Shelfmark value/);
  });

  test(`${Component.name} keeps fetch errors visible when summary is excluded`, () => {
    const component = new Component();
    const root = component.shadowRoot || component;
    component.getAttribute = (name) => name === 'fields' ? '' : null;
    component._data = {
      label: 'Error', version: 'IIIF', rights: 'Unavailable',
      summary: 'Unable to load manifest (HTTP 404).', fullSummary: 'Unable to load manifest (HTTP 404).',
      metadata: [], error: true,
    };
    component._renderData();
    assert.match(root.innerHTML, /Unable to load manifest \(HTTP 404\)/);
    assert.doesNotMatch(root.innerHTML, />IIIF<\/span>|Rights: Unavailable/);
  });
}
