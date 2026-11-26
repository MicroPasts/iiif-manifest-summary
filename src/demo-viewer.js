export function setupDemoViewer(document) {
  const host = document.getElementById('viewer-host');
  const status = document.getElementById('viewer-status');
  const origin = document.location.origin;
  let frame;
  let frameReady = false;
  let latestSelection;

  function sendTheme() {
    if (frameReady) {
      frame.contentWindow.postMessage({
        type: 'theme',
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      }, origin);
    }
  }

  document.defaultView.addEventListener('message', (event) => {
    if (event.origin !== origin || event.source !== frame?.contentWindow) return;
    if (event.data?.type === 'ready') {
      frameReady = true;
      sendTheme();
      if (latestSelection) frame.contentWindow.postMessage({ type: 'manifest', url: latestSelection }, origin);
    } else if (event.data?.type === 'status') {
      status.textContent = event.data.message;
    }
  });

  document.addEventListener('heritage:select', (event) => {
    const url = event.target?.getAttribute?.('manifest') || event.detail?.uri;
    if (typeof url !== 'string' || !url.trim()) {
      status.textContent = 'The selected card has no manifest URL.';
      return;
    }
    latestSelection = url;
    status.textContent = 'Loading viewer…';
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'IIIF manifest viewer';
      frame.src = './demo-viewer-frame.html';
      frame.allowFullscreen = true;
      frame.style.cssText = 'display: block; width: 100%; height: 600px; border: 0;';
      host.appendChild(frame);
    } else if (frameReady) {
      frame.contentWindow.postMessage({ type: 'manifest', url }, origin);
    }
  });

  const observer = new MutationObserver(sendTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
