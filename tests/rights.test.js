import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRightsLabel, summarizeManifest } from '../src/core.js';

test('formats canonical and cc-prefixed Creative Commons license URLs', () => {
  for (const code of ['by', 'by-sa', 'by-nd', 'by-nc', 'by-nc-sa', 'by-nc-nd']) {
    for (const prefix of ['', 'cc-']) {
      const url = `http://creativecommons.org/licenses/${prefix}${code}/4.0/`;
      assert.equal(formatRightsLabel(url), `CC ${code.toUpperCase()} 4.0`);
    }
  }
  assert.equal(formatRightsLabel('HTTPS://CREATIVECOMMONS.ORG/licenses/CC-BY/3.0/'), 'CC BY 3.0');
  assert.equal(formatRightsLabel('https://creativecommons.org/publicdomain/zero/1.0/'), 'CC0 1.0');
  assert.equal(formatRightsLabel('http://rightsstatements.org/vocab/InC-EDU/1.0/'), 'In Copyright - Educational Use');
  assert.equal(formatRightsLabel('https://example.org/rights'), 'https://example.org/rights');
});

test('preserves the original manifest rights URI while supplying a readable label', () => {
  const rights = 'http://creativecommons.org/licenses/cc-by/4.0/';
  for (const manifest of [{ rights, items: [] }, { license: rights }]) {
    const summary = summarizeManifest(manifest);
    assert.equal(summary.rights, rights);
    assert.equal(summary.rightsLabel, 'CC BY 4.0');
  }
});
