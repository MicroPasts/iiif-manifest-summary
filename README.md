# IIIF Manifest Summary Card

Zero-dependency JavaScript web components for displaying compact summaries of IIIF Presentation API v2 and v3 manifests. The components show the manifest title, summary, rights/license, thumbnail, canvas count, and up to four metadata fields without loading a heavy IIIF viewer.

Package: `@micropasts/iiif-manifest-summary`

## Features

- IIIF Presentation API v2 and v3 support
- Named shadow-DOM and Tailwind CSS/light-DOM components
- Fetches manifests with the browser `fetch()` API
- Shared in-memory fetch and summary cache
- Loading and fetch-error states
- HTML-safe plain-text summaries and metadata
- Creative Commons and RightsStatements-friendly license labels
- Clickable thumbnails with a native modal/overlay
- Copy-to-clipboard URI button
- Composed `heritage:select` event
- Support for IIIF language maps and legacy v2 values
- Custom templates for the shadow-DOM component
- No runtime dependencies

## Installation

### npm

```bash
npm install @micropasts/iiif-manifest-summary
```

ESM usage:

```html
<script type="module">
  import '@micropasts/iiif-manifest-summary';
</script>
```

### CDN

The IIFE build exposes `window.IiifManifestSummaryLib`:

```html
<script src="https://cdn.jsdelivr.net/npm/@micropasts/iiif-manifest-summary/dist/iiif-manifest-summary.iife.js"></script>

<iiif-manifest-summary
  manifest="https://example.org/iiif/manifest.json"
></iiif-manifest-summary>
```

The ESM build can also be loaded directly:

```html
<script type="module">
  import {
    IiifManifestSummary,
    IiifManifestSummaryTailwind,
  } from 'https://cdn.jsdelivr.net/npm/@micropasts/iiif-manifest-summary/dist/iiif-manifest-summary.esm.js';
</script>
```

CDNs do not rewrite package subpath exports. When importing individual source exports, use an npm-aware environment or configure the appropriate source/specifier paths.

## Components

### `<iiif-manifest-summary>` — Shadow DOM

The default component renders inside an open shadow root and is isolated from page styles.

```html
<iiif-manifest-summary
  manifest="https://example.org/iiif/manifest.json"
  theme="dark"
></iiif-manifest-summary>
```

It is registered globally under `iiif-manifest-summary` when it is not already defined.

#### Attributes

| Attribute | Required | Values | Description |
| --- | --- | --- | --- |
| `manifest` | Yes | Manifest URL | URI to fetch and summarize. Initial load and subsequent changes are supported. |
| `listen` | No | Custom event name | Listens for the named window event and uses `event.detail.manifest` to change manifests. |
| `theme` | No | `light`, `dark`, or omitted | Controls the built-in theme. `light` forces the light colors; `dark` forces dark colors; omitted follows `prefers-color-scheme: dark`. |

#### CSS custom properties

These variables can be set on the host element:

| Variable | Default in light mode | Purpose |
| --- | --- | --- |
| `--iiif-bg` | `#ffffff` | Card background |
| `--iiif-fg` | `#18181b` | Primary text |
| `--iiif-muted` | `#52525b` | Secondary text |
| `--iiif-border` | `#e4e4e7` | Card and thumbnail borders |
| `--iiif-surface` | `rgba(127, 127, 127, 0.08)` | Metadata and hover surface |
| `--iiif-accent` | `#0284c7` | IIIF version badge |
| `--iiif-radius` | `0.5rem` | Card radius |
| `--iiif-font` | `system-ui, -apple-system, sans-serif` | Component font |

Example:

```css
iiif-manifest-summary {
  --iiif-accent: #7c3aed;
  --iiif-radius: 0.75rem;
  --iiif-bg: #fafafa;
}
```

Dark-mode defaults for `--iiif-bg`, `--iiif-fg`, `--iiif-muted`, and `--iiif-border` are applied automatically for dark system preference unless the host has `theme="light"`. The `theme="dark"` attribute overrides system preference.

#### Shadow parts

The built-in template exposes the following parts for `::part(...)` styling:

| Part | Element |
| --- | --- |
| `card` | Outer card |
| `header` | Header row |
| `badge` | Version badge |
| `canvases` | Canvas-count text |
| `thumb` | Thumbnail image |
| `title` | Manifest title |
| `summary` | Summary text |
| `meta` | Metadata grid |

```css
iiif-manifest-summary::part(card) {
  max-width: 32rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

iiif-manifest-summary::part(badge) {
  background: #7c3aed;
}
```

#### Custom template

Pass a render function to `IiifManifestSummary.setTemplate(...)` to replace the built-in card template for every shadow-DOM component:

```js
import { IiifManifestSummary } from '@micropasts/iiif-manifest-summary';

IiifManifestSummary.setTemplate((summary, escapeHtml) => `
  <article>
    <h2>${escapeHtml(summary.label)}</h2>
    <p>${escapeHtml(summary.canvasCount)} canvases</p>
  </article>
`);
```

Set the template on an individual instance before or after connected content is loaded:

```js
const element = document.querySelector('iiif-manifest-summary');

element.template = (summary, escapeHtml) => `
  <strong>${escapeHtml(summary.label)}</strong>
`;
```

The instance template takes precedence over the global template. The escape callback HTML-escapes `&`, `<`, `>`, `"`, and control text used in templates.

### `<iiif-manifest-summary-tw>` — Tailwind/light DOM

This component renders directly into the host element, so its utility classes can be scanned and provided by Tailwind in the host application.

```html
<iiif-manifest-summary-tw
  manifest="https://example.org/iiif/manifest.json"
  card-class="border-sky-300 shadow-lg"
></iiif-manifest-summary-tw>
```

It is registered globally under `iiif-manifest-summary-tw` when it is not already defined.

#### Attributes

| Attribute | Required | Values | Description |
| --- | --- | --- | --- |
| `manifest` | Yes | Manifest URL | Initial URI to fetch and summarize. |
| `listen` | No | Custom event name | Listens for the named window event and uses `event.detail.manifest` to change manifests. |
| `card-class` | No | Tailwind/CSS classes | Extra classes appended to the built-in card classes. |

The component's `dark:` utilities follow the host application's Tailwind dark-mode
configuration. With Tailwind's default media-based strategy, they automatically
follow the system color scheme, including changes while the page is open. If the
application configures a class- or selector-based dark variant instead, the
application is responsible for updating that selector; the component does not
change the page's theme.

Ensure Tailwind scans the component's source (including dependencies if installed
from npm), or otherwise includes its utility classes in the generated CSS. For
example, Tailwind v3 can include
`./node_modules/@micropasts/iiif-manifest-summary/src/tailwind.js` in its
`content` configuration; Tailwind v4 can register the same file with `@source`.
The demo uses a class-based variant, follows system changes until its theme toggle
is used, and then preserves the chosen theme in local storage.

#### Static Tailwind classes

The Tailwind component's default class groups are available as `IiifManifestSummaryTailwind.classes` and can be overridden before rendering:

```js
import { IiifManifestSummaryTailwind } from '@micropasts/iiif-manifest-summary';

IiifManifestSummaryTailwind.classes.card =
  'rounded-lg border border-slate-300 bg-white p-4';
IiifManifestSummaryTailwind.classes.btn =
  'rounded border px-2 py-1 text-xs';
```

## Listening to external selection events

Set `listen` to an event name on either component:

```html
<iiif-manifest-summary listen="catalog:select"></iiif-manifest-summary>
```

Dispatch the event on `window`:

```js
window.dispatchEvent(
  new CustomEvent('catalog:select', {
    detail: {
      manifest: 'https://example.org/iiif/manifest.json',
    },
  }),
);
```

The listener is added on `connectedCallback()` and removed on `disconnectedCallback()`.

## Selection event

Both components dispatch a bubbling, composed `heritage:select` event when **Inspect** is clicked. `composed: true` allows the event to cross the shadow-DOM boundary.

```js
document.addEventListener('heritage:select', (event) => {
  const { uri, label, canvasCount, version } = event.detail;
  console.log(uri, label, canvasCount, version);
});
```

| Detail field | Type | Description |
| --- | --- | --- |
| `uri` | `string` | Resolved manifest URI |
| `label` | `string` | Displayed manifest label |
| `canvasCount` | `number` | Number of canvases/items found |
| `version` | `string` | `IIIF v2`, `IIIF v3`, or `IIIF` for fetch failures |

## Public methods

Methods are available on component instances:

| Method | Class | Description |
| --- | --- | --- |
| `load(url)` | Both | Fetch or retrieve a manifest summary and render it |
| `setTemplate(fn)` | `IiifManifestSummary` only (static) | Set a global custom shadow-DOM render function |

The shadow-DOM component also supports an instance `template` property that is checked before the global template.

## JavaScript API

All named exports are exported from the package entry point.

```js
import {
  summarizeManifest,
  seedManifest,
  clearManifestCache,
  fetchManifestSummary,
  emitManifestSelect,
  copyTextToClipboard,
  stripHtml,
  formatRightsLabel,
  IiifManifestSummary,
  IiifManifestSummaryTailwind,
} from '@micropasts/iiif-manifest-summary';
```

Subpath exports are also declared:

| Import | Exports |
| --- | --- |
| `@micropasts/iiif-manifest-summary/core` | Core utilities |
| `@micropasts/iiif-manifest-summary/shadow` | Shadow-DOM component |
| `@micropasts/iiif-manifest-summary/tailwind` | Tailwind component |

### `summarizeManifest(manifest, manifestUri?)`

Normalizes a raw IIIF v2 or v3 manifest object into a summary object.

```js
const summary = summarizeManifest(rawManifest, 'https://example.org/manifest');
```

The returned shape is:

```js
{
  uri: 'https://example.org/manifest',
  version: 'IIIF v3',
  label: 'Manifest title',
  summary: 'Short description',
  rights: 'http://creativecommons.org/licenses/by/4.0/',
  rightsLabel: 'CC BY 4.0',
  thumbnail: 'https://example.org/thumbnail.jpg',
  canvasCount: 12,
  metadata: [
    { label: 'Repository', value: 'Example Archive' },
  ],
  // present on fetch failure only:
  error: true,
}
```

The normalizer:

- Detects v3 from a Presentation 3 context or a top-level `items` array
- Prefers v3 `summary`, then v2 `description`
- Uses v3 `rights`, or v2 `license`
- Checks a v3 manifest thumbnail, v2 sequence thumbnail, or v3 first-canvas thumbnail
- Counts `items` that are canvases or falls back to v2 sequence canvases
- Includes at most four metadata entries

Language-map values prefer the `en` language, then `none`, then the first available language. Arrays are joined with ` · `.

### `fetchManifestSummary(uri)`

Fetches and summarizes a manifest URI.

```js
const summary = await fetchManifestSummary(
  'https://example.org/iiif/manifest.json',
);
```

The request sends `Accept: application/json`. Concurrent requests for the same URI share an in-flight promise. HTTP and network failures return an error summary rather than rejecting:

```js
{
  uri,
  version: 'IIIF',
  label: uri,
  summary: 'Unable to load manifest (HTTP 404).',
  rights: 'Unavailable',
  thumbnail: null,
  canvasCount: 0,
  metadata: [],
  error: true,
}
```

### `seedManifest(uri, manifestJson)`

Places a raw manifest into the summary cache. This is useful for server-rendered data, testing, demos, and offline sandboxes.

```js
seedManifest('https://example.org/manifest.json', rawManifestJson);

const summary = await fetchManifestSummary(
  'https://example.org/manifest.json',
);
```

### `clearManifestCache()`

Clears the successful summary cache. In-flight fetches are not cancelled or cleared.

```js
clearManifestCache();
```

### `emitManifestSelect(target, summary)`

Dispatches `heritage:select` from `target` with a selected subset of summary fields. It is also used internally by the components.

```js
emitManifestSelect(document.querySelector('.container'), summary);
```

### `copyTextToClipboard(text)`

Copies text using `navigator.clipboard` in a secure context and falls back to a temporary textarea and `document.execCommand('copy')`.

```js
const copied = await copyTextToClipboard('https://example.org/manifest.json');
```

Returns `true` when the copy operation reports success, otherwise `false`.

### `stripHtml(value)`

Converts HTML markup to plain text. It is used for manifest labels, summaries, and metadata values. The browser implementation uses `DOMParser`; a built-in fallback handles tags and common character references.

```js
stripHtml('<p>A <strong>plain</strong> description &amp; title.</p>');
// 'A plain description & title.'
```

### `formatRightsLabel(rights)`

Converts common Creative Commons and RightsStatements URIs into readable labels.

```js
formatRightsLabel('http://creativecommons.org/licenses/by-sa/4.0/');
// 'CC BY-SA 4.0'

formatRightsLabel('http://rightsstatements.org/vocab/InC-EDU/1.0/');
// 'In Copyright - Educational Use'
```

## Demo

Run the local demo:

```bash
npm run dev
```

This builds `dist/` and `docs/`, then serves the demo directory on a local development server.

Open the demo to compare the Tailwind light-DOM component with the shadow-DOM component. The demo seeds both v2 and v3 sample manifests, so it can render without live manifest requests.

## Build

```bash
npm run build
```

The build script creates:

- `dist/iiif-manifest-summary.esm.js`
- `dist/iiif-manifest-summary.iife.js`
- `docs/iiif-manifest-summary.esm.js`
- `docs/index.html`

The IIFE build exposes the package API through `window.IiifManifestSummaryLib`.

## Browser support

The components use standard custom elements, shadow DOM, `fetch`, `Map`, `async`/`await`, and template literals. Serve module builds over HTTP(S); opening module files directly with `file://` may be restricted by browser module-loading rules.

## License

MIT
