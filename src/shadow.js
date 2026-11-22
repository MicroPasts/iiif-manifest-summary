import {
  fetchManifestSummary,
  emitManifestSelect,
  copyTextToClipboard,
} from './core.js';

let globalTemplate = null;

export class IiifManifestSummary extends HTMLElement {
  static get observedAttributes() {
    return ['manifest', 'listen'];
  }

  static setTemplate(fn) {
    globalTemplate = fn;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this.template = null;
    this._onExternalSelect = this._onExternalSelect.bind(this);
  }

  connectedCallback() {
    const url = this.getAttribute('manifest');
    if (url) this.load(url);

    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.addEventListener(listenEvent, this._onExternalSelect);
    }
  }

  disconnectedCallback() {
    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.removeEventListener(listenEvent, this._onExternalSelect);
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this.isConnected) return;
    if (name === 'manifest' && newVal) {
      this.load(newVal);
    }
  }

  _onExternalSelect(e) {
    if (e.detail?.manifest) {
      this.setAttribute('manifest', e.detail.manifest);
      this.load(e.detail.manifest);
    }
  }

  async load(url) {
    this._renderLoading();
    this._data = await fetchManifestSummary(url);
    this._renderData();
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _renderLoading() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, -apple-system, sans-serif; }
        .box { padding: 14px; border: 1px solid #e4e4e7; border-radius: 0.5rem; font-size: 12px; color: #71717a; }
      </style>
      <div class="box">Loading IIIF manifest summary…</div>
    `;
  }

  _renderData() {
    const d = this._data;
    if (!d) return;

    const customFn = this.template || globalTemplate;
    if (typeof customFn === 'function') {
      this.shadowRoot.innerHTML = customFn(d, this._esc.bind(this));
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --iiif-bg: #ffffff;
          --iiif-fg: #18181b;
          --iiif-muted: #52525b;
          --iiif-border: #e4e4e7;
          --iiif-surface: rgba(127, 127, 127, 0.08);
          --iiif-accent: #0284c7;
          --iiif-radius: 0.5rem;
          --iiif-font: system-ui, -apple-system, sans-serif;

          display: block;
          font-family: var(--iiif-font);
          color: var(--iiif-fg);
        }

        @media (prefers-color-scheme: dark) {
          :host(:not([theme="light"])) {
            --iiif-bg: #18181b;
            --iiif-fg: #f4f4f5;
            --iiif-muted: #a1a1aa;
            --iiif-border: #3f3f46;
          }
        }

        :host([theme="dark"]) {
          --iiif-bg: #18181b;
          --iiif-fg: #f4f4f5;
          --iiif-muted: #a1a1aa;
          --iiif-border: #3f3f46;
        }

        .card {
          background: var(--iiif-bg);
          color: var(--iiif-fg);
          border: 1px solid var(--iiif-border);
          border-radius: var(--iiif-radius);
          padding: 14px;
        }

        .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
        .badge { background: var(--iiif-accent); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
        .canvases { font-size: 11px; color: var(--iiif-muted); font-family: ui-monospace, monospace; }
        .body { display: flex; gap: 12px; align-items: flex-start; }
        .thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 4px; flex-shrink: 0; border: 1px solid var(--iiif-border); }
        .title { font-weight: 700; font-size: 15px; line-height: 1.3; }
        .summary { margin: 8px 0; font-size: 12.5px; line-height: 1.45; color: var(--iiif-fg); }
        .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; margin: 8px 0; padding: 8px; border-radius: 4px; background: var(--iiif-surface); font-size: 11px; }
        .meta span { display: block; color: var(--iiif-muted); }
        .footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--iiif-border); padding-top: 8px; margin-top: 8px; font-size: 11px; }
        .rights { color: var(--iiif-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
        .btns { display: flex; gap: 6px; }
        button { font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--iiif-border); background: transparent; color: inherit; cursor: pointer; }
        button:hover { background: var(--iiif-surface); }
        .thumb-button { padding: 0; border: 0; background: transparent; border-radius: 4px; }
        .thumb-button:hover { background: transparent; }
        .lightbox {
          width: min(90vw, 900px);
          max-height: 90vh;
          padding: 12px;
          border: 1px solid var(--iiif-border);
          border-radius: var(--iiif-radius);
          background: var(--iiif-bg);
          color: var(--iiif-fg);
        }
        .lightbox::backdrop { background: rgba(0, 0, 0, 0.78); }
        .lightbox-close { float: right; margin-bottom: 8px; }
        .lightbox-image { display: block; width: 100%; max-height: calc(90vh - 52px); object-fit: contain; }
      </style>
      <div part="card" class="card">
        <div part="header" class="top">
          <span part="badge" class="badge">${this._esc(d.version)}</span>
          <span part="canvases" class="canvases">${d.canvasCount} canvas(es)</span>
        </div>
        <div class="body">
          ${d.thumbnail ? `<button type="button" class="thumb-button" data-open-lightbox aria-label="View larger thumbnail"><img part="thumb" class="thumb" src="${this._esc(d.thumbnail)}" alt=""></button>` : ''}
          <div>
            <div part="title" class="title">${this._esc(d.label)}</div>
          </div>
        </div>
        ${d.summary ? `<p part="summary" class="summary">${this._esc(d.summary)}</p>` : ''}
        ${
          d.metadata?.length
            ? `<div part="meta" class="meta">${d.metadata
                .map((m) => `<div><span>${this._esc(m.label)}</span><strong>${this._esc(m.value)}</strong></div>`)
                .join('')}</div>`
            : ''
        }
        <div class="footer">
          <span class="rights" title="${this._esc(d.rights)}">Rights: ${this._esc(d.rightsLabel || d.rights)}</span>
          <div class="btns">
            <button type="button" class="copy-uri" data-uri="${this._esc(d.uri)}">Copy URI</button>
            <button type="button" class="select-btn">Select</button>
          </div>
        </div>
      </div>
      ${d.thumbnail ? `<dialog class="lightbox" aria-label="Larger manifest thumbnail">
        <button type="button" class="lightbox-close" data-close-lightbox aria-label="Close">Close</button>
        <img class="lightbox-image" src="${this._esc(d.thumbnail)}" alt="${this._esc(d.label)}">
      </dialog>` : ''}
    `;

    const lightbox = this.shadowRoot.querySelector('.lightbox');
    this.shadowRoot.querySelector('[data-open-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.showModal === 'function') lightbox.showModal();
      else lightbox?.setAttribute('open', '');
    });
    this.shadowRoot.querySelector('[data-close-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.close === 'function') lightbox.close();
      else lightbox?.removeAttribute('open');
    });
    lightbox?.addEventListener('click', (event) => {
      if (event.target === lightbox) {
        if (typeof lightbox.close === 'function') lightbox.close();
        else lightbox.removeAttribute('open');
      }
    });

    this.shadowRoot.querySelector('.copy-uri')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const ok = await copyTextToClipboard(btn.getAttribute('data-uri') || '');
      if (ok) {
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = 'Copy URI';
        }, 1200);
      }
    });

    this.shadowRoot.querySelector('.select-btn')?.addEventListener('click', () => {
      emitManifestSelect(this, d);
    });
  }
}

if (!customElements.get('iiif-manifest-summary')) {
  customElements.define('iiif-manifest-summary', IiifManifestSummary);
}