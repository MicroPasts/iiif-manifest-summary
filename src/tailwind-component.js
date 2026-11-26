import {
  fetchManifestSummary,
  emitManifestSelect,
  copyTextToClipboard,
  getCardOptions,
  updateActionVisibility,
  getInspectLabel,
} from './core.js';

export class IiifManifestSummaryTailwind extends HTMLElement {
  static get observedAttributes() {
    return ['hide-inspect', 'hide-copy', 'inspect-label', 'fields', 'metadata-fields'];
  }

  static classes = {
    card:
      'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-zinc-900 dark:text-zinc-100',
    btn:
      'rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors',
  };

  constructor() {
    super();
    this._data = null;
    this._initialized = false;
    this._onExternalSelect = this._onExternalSelect.bind(this);
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
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
    if (oldVal === newVal) return;
    if (name === 'hide-inspect' || name === 'hide-copy') {
      updateActionVisibility(this, name === 'hide-inspect' ? '[data-iiif-select]' : '[data-iiif-copy]', newVal !== null);
    } else if (name === 'inspect-label') {
      const button = this.querySelector('[data-iiif-select]');
      if (button) button.textContent = getInspectLabel(newVal);
    } else if ((name === 'fields' || name === 'metadata-fields') && !this._loading) {
      this._renderData();
    }
  }

  _onExternalSelect(e) {
    if (e.detail?.manifest) {
      this.setAttribute('manifest', e.detail.manifest);
      this.load(e.detail.manifest);
    }
  }

  async load(url) {
    this._loading = true;
    const c = IiifManifestSummaryTailwind.classes;
    this.innerHTML = `<div class="${c.card} text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">Loading IIIF manifest summary…</div>`;
    this._data = await fetchManifestSummary(url);
    this._loading = false;
    this._renderData();
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _renderData() {
    const d = this._data;
    if (!d) return;
    const c = IiifManifestSummaryTailwind.classes;
    const { fields, metadata } = getCardOptions(this, d);
    const show = (field) => fields.has(field);
    const cardClass = `${c.card} ${this.getAttribute('card-class') || ''}`.trim();

    this.innerHTML = `
      <div class="${cardClass}">
        ${show('version') || show('canvas-count') ? `<div class="flex items-center justify-between gap-2 mb-2">
          ${show('version') ? `<span class="inline-flex items-center rounded bg-sky-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">${this._esc(d.version)}</span>` : ''}
          ${show('canvas-count') ? `<span class="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">${d.canvasCount} canvas(es)</span>` : ''}
        </div>` : ''}

        ${show('label') || (show('thumbnail') && d.thumbnail) ? `<div class="flex items-start gap-3">
          ${show('thumbnail') && d.thumbnail ? `<button type="button" data-open-lightbox aria-label="View larger thumbnail" class="shrink-0 rounded border-0 p-0">
            <img src="${this._esc(d.thumbnail)}" alt="" class="h-14 w-14 rounded object-cover border border-zinc-200 dark:border-zinc-700">
          </button>` : ''}
          ${show('label') ? `<div class="min-w-0">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">${this._esc(d.label)}</h3>
          </div>` : ''}
        </div>` : ''}

        ${(show('summary') || d.error) && d.summary ? `<p class="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">${this._esc(d.summary)}</p>` : ''}
        ${(show('summary') || d.error) && d.fullSummary && d.fullSummary !== d.summary ? `<button type="button" data-iiif-summary-toggle aria-expanded="false" class="${c.btn} mt-1">Read more</button>` : ''}

        ${
          show('metadata') && metadata?.length
            ? `<div class="mt-2.5 grid grid-cols-2 gap-2 rounded-md bg-zinc-50 dark:bg-zinc-950/70 p-2 text-xs border border-zinc-200/70 dark:border-zinc-800">${metadata
                .map(
                  (m) =>
                    `<div><span class="block text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">${this._esc(m.label)}</span><strong class="font-medium text-zinc-900 dark:text-zinc-100">${this._esc(m.value)}</strong></div>`
                )
                .join('')}</div>`
            : ''
        }

        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-2 text-[11px]">
          ${show('rights') ? `<span class="inline-block max-w-full break-words rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-medium text-zinc-800 dark:text-zinc-200" title="${this._esc(d.rights)}">Rights: ${this._esc(d.rightsLabel || d.rights)}</span>` : ''}
          <div class="flex items-center gap-1.5">
            <button type="button" data-iiif-copy data-uri="${this._esc(d.uri)}" class="${c.btn}"${this.hasAttribute('hide-copy') ? ' hidden style="display: none"' : ''}>Copy URI</button>
            <button type="button" data-iiif-select class="${c.btn}"${this.hasAttribute('hide-inspect') ? ' hidden style="display: none"' : ''}>${this._esc(getInspectLabel(this.getAttribute('inspect-label')))}</button>
          </div>
        </div>
      </div>
      ${show('thumbnail') && d.thumbnail ? `<dialog data-iiif-lightbox aria-label="Larger manifest thumbnail" class="w-[min(90vw,900px)] max-h-[90vh] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-zinc-900 dark:text-zinc-100 backdrop:bg-black/75">
        <button type="button" data-close-lightbox aria-label="Close" class="${c.btn} float-right mb-2">Close</button>
        <img src="${this._esc(d.thumbnail)}" alt="${this._esc(d.label)}" class="block h-auto max-h-[calc(90vh-52px)] w-full object-contain">
      </dialog>` : ''}
    `;

    this.querySelector('[data-iiif-summary-toggle]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.previousElementSibling.textContent = expanded ? d.summary : d.fullSummary;
      button.setAttribute('aria-expanded', String(!expanded));
      button.textContent = expanded ? 'Read more' : 'Read less';
    });

    const lightbox = this.querySelector('[data-iiif-lightbox]');
    this.querySelector('[data-open-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.showModal === 'function') lightbox.showModal();
      else lightbox?.setAttribute('open', '');
    });
    this.querySelector('[data-close-lightbox]')?.addEventListener('click', () => {
      if (typeof lightbox?.close === 'function') lightbox.close();
      else lightbox?.removeAttribute('open');
    });
    lightbox?.addEventListener('click', (event) => {
      if (event.target === lightbox) {
        if (typeof lightbox.close === 'function') lightbox.close();
        else lightbox.removeAttribute('open');
      }
    });

    this.querySelector('[data-iiif-copy]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const ok = await copyTextToClipboard(btn.getAttribute('data-uri') || '');
      if (ok) {
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = 'Copy URI';
        }, 1200);
      }
    });

    this.querySelector('[data-iiif-select]')?.addEventListener('click', () => {
      emitManifestSelect(this, d);
    });
  }
}

if (!customElements.get('iiif-manifest-summary-tw')) {
  customElements.define('iiif-manifest-summary-tw', IiifManifestSummaryTailwind);
}