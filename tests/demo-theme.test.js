import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const demo = readFileSync(new URL('../src/demo.html', import.meta.url), 'utf8');
const themeScript = demo.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
assert.ok(themeScript, 'Demo theme script must exist');

function createDemoTheme({ dark = false, saved = null } = {}) {
  const classes = new Set();
  const shadowCard = {
    setAttribute(name, value) {
      assert.equal(name, 'theme');
      this.theme = value;
    },
  };
  const toggleButton = {
    addEventListener(type, listener) {
      assert.equal(type, 'click');
      this.listener = listener;
    },
  };
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
    setItem(key, value) {
      assert.equal(key, 'iiif-demo-theme');
      saved = value;
    },
  };
  let domReady;
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
          contains(name) {
            return classes.has(name);
          },
        },
      },
      querySelectorAll(selector) {
        assert.equal(selector, 'iiif-manifest-summary');
        return domReady ? [shadowCard] : [];
      },
      addEventListener(type, listener) {
        assert.equal(type, 'DOMContentLoaded');
        domReady = listener;
      },
      getElementById(id) {
        assert.equal(id, 'theme-toggle');
        return toggleButton;
      },
    },
  });
  domReady();
  return {
    isDark: () => classes.has('dark'),
    shadowTheme: () => shadowCard.theme,
    toggle: () => toggleButton.listener(),
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
  assert.equal(theme.shadowTheme(), 'light');
  theme.setSystemDark(true);
  assert.equal(theme.isDark(), true);
  assert.equal(theme.shadowTheme(), 'dark');
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), false);
  assert.equal(theme.shadowTheme(), 'light');
  const darkTheme = createDemoTheme({ dark: true });
  assert.equal(darkTheme.isDark(), true);
  assert.equal(darkTheme.shadowTheme(), 'dark');
});

test('saved theme takes precedence over system changes', () => {
  const theme = createDemoTheme({ dark: true, saved: 'light' });
  assert.equal(theme.isDark(), false);
  assert.equal(theme.shadowTheme(), 'light');
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), false);
  theme.setSavedTheme('dark');
  theme.setSystemDark(true);
  assert.equal(theme.isDark(), true);
  assert.equal(theme.shadowTheme(), 'dark');
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), true);
  theme.setSavedTheme(null);
  theme.setSystemDark(false);
  assert.equal(theme.isDark(), false);
  assert.equal(theme.shadowTheme(), 'light');
});

test('demo toggle synchronizes both cards and keeps the manual choice', () => {
  const theme = createDemoTheme({ dark: false });
  theme.toggle();
  assert.equal(theme.isDark(), true);
  assert.equal(theme.shadowTheme(), 'dark');
  theme.setSystemDark(true);
  theme.setSystemDark(false);
  assert.equal(theme.shadowTheme(), 'dark');
  theme.toggle();
  assert.equal(theme.isDark(), false);
  assert.equal(theme.shadowTheme(), 'light');
  theme.setSystemDark(true);
  assert.equal(theme.isDark(), false);
  assert.equal(theme.shadowTheme(), 'light');
});
