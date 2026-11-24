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
    if (selector === '.summary-toggle' || selector === '[data-iiif-summary-toggle]') {
      return this.innerHTML.includes('aria-expanded="false"') ? this.toggle : null;
    }
    return null;
  }
}

globalThis.HTMLElement = class extends MockRoot {
  attachShadow() { this.shadowRoot = new MockRoot(); }
  getAttribute() { return null; }
};
globalThis.customElements = { get() {}, define() {} };
const { IiifManifestSummary } = await import('../src/shadow.js');
const { IiifManifestSummaryTailwind } = await import('../src/tailwind.js');

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
}
