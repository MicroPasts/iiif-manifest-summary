const VIEWER_MODULE = 'https://cdn.jsdelivr.net/npm/@micropasts/iiif-viewer@1.0.1/dist/iiif-viewer.js';
const VIEWER_CSS = 'https://cdn.jsdelivr.net/npm/@micropasts/iiif-viewer@1.0.1/dist/iiif-viewer.css';
const origin = location.origin;
let viewer;
let theme = 'light';
let latestSelection;
let processing = false;

function sendStatus(message) {
  parent.postMessage({ type: 'status', message }, origin);
}

async function createViewer() {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = VIEWER_CSS;
  const stylesheetReady = new Promise((resolve, reject) => {
    stylesheet.addEventListener('load', resolve, { once: true });
    stylesheet.addEventListener('error', () => reject(new Error('Unable to load viewer styles.')), { once: true });
  });
  document.head.appendChild(stylesheet);
  try {
    const [{ IIIFViewer }] = await Promise.all([import(VIEWER_MODULE), stylesheetReady]);
    return new IIIFViewer(document.getElementById('viewer'), { theme, height: '600px', showUrlInput: false });
  } catch (error) {
    stylesheet.remove();
    throw error;
  }
}

async function processSelections() {
  if (processing) return;
  processing = true;
  try {
    while (latestSelection) {
      const url = latestSelection;
      latestSelection = null;
      sendStatus('Loading viewer…');
      try {
        if (!viewer) viewer = await createViewer();
        if (latestSelection) continue;
        viewer.setTheme(theme);
        await viewer.loadManifest(url);
        if (!latestSelection) sendStatus('Select another card to change the manifest. Any loading errors are shown in the viewer.');
      } catch (error) {
        console.error('Unable to open the IIIF viewer:', error);
        if (!latestSelection) sendStatus('Unable to load the viewer. Check your connection and select Inspect to retry.');
      }
    }
  } finally {
    processing = false;
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== origin || event.source !== parent) return;
  if (event.data?.type === 'theme' && (event.data.theme === 'light' || event.data.theme === 'dark')) {
    theme = event.data.theme;
    viewer?.setTheme(theme);
  } else if (event.data?.type === 'manifest' && typeof event.data.url === 'string' && event.data.url.trim()) {
    latestSelection = event.data.url;
    void processSelections();
  }
});

parent.postMessage({ type: 'ready' }, origin);
