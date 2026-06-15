import { wake, unwake, publish, type ListCache, type Station, type Wrapper } from './engine.ts';
import { ComponentRuntime, type ComponentModule } from './component.ts';
import type { Off } from './utils.ts';

// State *is* `data-*`. The Proxy serializes objects on write and parses on
// read, so the live DOM inspector doubles as state debugger. The
// MutationObserver picks up external edits (DevTools, user scripts) and
// republishes them through the same Station the framework writes to.
// Kept as permanent core — no PoC binding exercises it yet, but the surface
// is intentionally always present.
export class DataWrapper extends HTMLElement {
    declare state:      Record<string, unknown>;
    declare _subs:      Station;
    declare _unsubs:    Off[];
    declare _listCache: ListCache;
    declare _observer:  MutationObserver;
    declare _component?: ComponentRuntime;

    constructor() {
        super();
        const self = this;

        self._subs      = {};
        self._unsubs    = [];
        self._listCache = new Map();

        self.state = new Proxy(self.dataset as unknown as Record<string, unknown>, {
            set(target, key: string, value: unknown) {
                const serialized = (value && typeof value === 'object')
                    ? JSON.stringify(value)
                    : String(value ?? '');
                if ((target as DOMStringMap)[key] === serialized) return true;
                (target as DOMStringMap)[key] = serialized;
                publish(self._subs, key, value);
                return true;
            },
            get(target, key: string) {
                const raw = (target as DOMStringMap)[key];
                if (raw == null) return undefined;
                try { return JSON.parse(raw); } catch { return raw; }
            },
        });

        self._observer = new MutationObserver(muts => {
            for (const m of muts) {
                if (!m.attributeName?.startsWith('data-')) continue;
                const key = m.attributeName.slice(5).replace(/-./g, c => c[1].toUpperCase());
                publish(self._subs, key, self.state[key]);
            }
        });
    }

    connectedCallback() {
        this._observer.observe(this, { attributes: true, attributeOldValue: true });
        const src = this.getAttribute('src');
        if (src) void load(this, src);
        else wake(this);
    }

    disconnectedCallback() {
        this._observer.disconnect();
        unwake(this);
        this._component?.destroy();
        this._component = undefined;
    }
}

// load fetches the view, extracts an inline component module, blob-imports it,
// swaps the wrapper's contents, attaches a runtime, and wakes the subtree so
// bindings can resolve module exports.
export const load = async (wrapper: Wrapper, src: string) => {
    const url  = new URL(src, document.baseURI);
    const res  = await fetch(url);
    const html = await res.text();
    const tpl  = document.createElement('template');
    tpl.innerHTML = html;

    const script = tpl.content.querySelector<HTMLScriptElement>(
        'script[type="module"][data-component]'
    );
    let module: ComponentModule | undefined;
    if (script) {
        script.remove();
        const label    = script.dataset.component || wrapper.id || 'anonymous';
        const sourceURL = `\n//# sourceURL=${url.href}#${label}`;
        const blob     = new Blob([(script.textContent ?? '') + sourceURL], { type: 'text/javascript' });
        const blobURL  = URL.createObjectURL(blob);
        try   { module = await import(blobURL) as ComponentModule; }
        finally { URL.revokeObjectURL(blobURL); }
    }

    unwake(wrapper);
    wrapper._component?.destroy();
    wrapper.innerHTML = '';
    wrapper.append(tpl.content);
    wrapper._subs      = {};
    wrapper._unsubs    = [];
    wrapper._listCache = new Map();
    wrapper._component = module ? new ComponentRuntime(wrapper, module) : undefined;
    wake(wrapper);
};

if (typeof customElements !== 'undefined' && !customElements.get('data-wrapper')) {
    customElements.define('data-wrapper', DataWrapper);
}
