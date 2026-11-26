import assert from 'node:assert/strict';
import test from 'node:test';
import { setupDemoViewer } from '../src/demo-viewer.js';

test('demo sends the latest selection and theme to its viewer frame', () => {
  const handlers = {};
  const messages = [];
  const status = { textContent: '' };
  const frameWindow = { postMessage: (message, origin) => messages.push({ message, origin }) };
  const host = { appendChild(element) { this.frame = element; } };
  const classes = new Set();
  const document = {
    location: { origin: 'https://example.org' },
    documentElement: { classList: { contains: (name) => classes.has(name) } },
    defaultView: { addEventListener(type, listener) { handlers[type] = listener; } },
    getElementById(id) { return id === 'viewer-host' ? host : status; },
    createElement() { return { style: {}, contentWindow: frameWindow }; },
    addEventListener(type, listener) { handlers[type] = listener; },
  };
  const originalObserver = globalThis.MutationObserver;
  let themeChanged;
  globalThis.MutationObserver = class {
    constructor(callback) { themeChanged = callback; }
    observe() {}
  };
  try {
    setupDemoViewer(document);
    handlers['heritage:select']({ target: { getAttribute: () => 'https://example.org/source' }, detail: { uri: 'https://example.org/canonical' } });
    handlers['heritage:select']({ target: {}, detail: { uri: 'https://example.org/latest' } });
    assert.equal(host.frame.title, 'IIIF manifest viewer');
    assert.equal(host.frame.allowFullscreen, true);
    assert.equal(messages.length, 0);
    handlers.message({ origin: 'https://other.example', source: frameWindow, data: { type: 'ready' } });
    assert.equal(messages.length, 0);
    handlers.message({ origin: 'https://example.org', source: frameWindow, data: { type: 'ready' } });
    assert.deepEqual(messages.map(({ message }) => message), [
      { type: 'theme', theme: 'light' },
      { type: 'manifest', url: 'https://example.org/latest' },
    ]);
    classes.add('dark');
    themeChanged();
    assert.deepEqual(messages[2].message, { type: 'theme', theme: 'dark' });
    handlers['heritage:select']({ target: { getAttribute: () => 'https://example.org/source' }, detail: { uri: 'https://example.org/canonical' } });
    assert.deepEqual(messages[3].message, { type: 'manifest', url: 'https://example.org/source' });
    handlers.message({ origin: 'https://example.org', source: frameWindow, data: { type: 'status', message: 'Viewer error' } });
    assert.equal(status.textContent, 'Viewer error');
    handlers.message({ origin: 'https://example.org', source: {}, data: { type: 'status', message: 'Untrusted' } });
    assert.equal(status.textContent, 'Viewer error');
  } finally {
    globalThis.MutationObserver = originalObserver;
  }
});
