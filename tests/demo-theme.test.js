import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const demo = readFileSync(new URL('../src/demo.html', import.meta.url), 'utf8');
const themeScript = demo.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
assert.ok(themeScript, 'Demo theme script must exist');

function createDemoTheme({ dark = false, saved = null } = {}) {
  const classes = new Set();
  const systemTheme = {
    matches: dark,
    addEventListener(type, listener) {
      assert.equal(type, 'change');
      this.listener = listener;
    },
  };
  const localStorage = {
    getItem(key) {
      assert.equal(key, 'iiif-demo-theme');
      return saved;
    },
  };
  runInNewContext(themeScript, {
    localStorage,
    window: { matchMedia: () => systemTheme },
    document: {
      documentElement: {
        classList: {
          toggle(name, enabled) {
            if (enabled) classes.add(name);
            else classes.delete(name);
          },
        },
      },
    },
  });
  return {
    isDark: () => classes.has('dark'),
    setSystemDark(value) {
      systemTheme.matches = value;
      systemTheme.listener();
    },
    setSavedTheme(value) {
      saved = value;
    },
  };
}

test('demo follows system theme on load and on changes', () => {
  const theme = createDemoTheme();
  assert.equal(theme.isDark(), false);
  theme.setSystemDark(true);
  assert.equal(theme.isDark(), true);
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), false);
  assert.equal(createDemoTheme({ dark: true }).isDark(), true);
});

test('saved theme takes precedence over system changes', () => {
  const theme = createDemoTheme({ dark: true, saved: 'light' });
  assert.equal(theme.isDark(), false);
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), false);
  theme.setSavedTheme('dark');
  theme.setSystemDark(true);
  assert.equal(theme.isDark(), true);
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), true);
  theme.setSavedTheme(null);
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), false);
});
