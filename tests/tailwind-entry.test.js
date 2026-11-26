import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Tailwind component is not named like a Tailwind configuration', () => {
  const files = readdirSync(new URL('../src/', import.meta.url));
  assert.ok(files.includes('tailwind-component.js'));
  assert.ok(!files.some((name) =>
    /^tailwind(?:|\.config|\..*\.config|\.config\..*)\.(?:js|cjs|ts|mjs|mts|cts)$/.test(name)));
});

test('published Tailwind subpath resolves to the component', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.exports['./tailwind'], './src/tailwind-component.js');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.HTMLElement = class {};
    globalThis.customElements = { get() {}, define() {} };
    const component = await import('@micropasts/iiif-manifest-summary/tailwind');
    if (typeof component.IiifManifestSummaryTailwind !== 'function') process.exit(1);
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
