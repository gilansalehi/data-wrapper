import { emit, on } from './utils.ts';
import { wake } from './wire.ts';
import { broadcast } from './engine.ts';
import type { ListCache, Station } from './engine.ts';

const v = '0.0.4';

export class DataWrapper extends HTMLElement {
    declare state:      Record<string, unknown>;
    declare _subs:      Station;
    declare _isSyncing: boolean;
    declare _listCache: ListCache;
    declare _observer:  MutationObserver;

    constructor() {
        super();
        const self = this;

        self._subs      = {};
        self._listCache = new Map();
        self._isSyncing = false;

        // #region state-proxy
        self.state = new Proxy(self.dataset as unknown as Record<string, unknown>, {
            set(target, key: string, value: unknown) {
                const serialized = (value && typeof value === 'object')
                    ? JSON.stringify(value)
                    : String(value ?? '');

                if ((target as DOMStringMap)[key] === serialized) return true;

                self._isSyncing = true;
                (target as DOMStringMap)[key] = serialized;
                self._broadcast(key, value);
                queueMicrotask(() => { self._isSyncing = false; });
                return true;
            },
            get(target, key: string) {
                const val = (target as DOMStringMap)[key];
                if (val === undefined) return undefined;
                try { return JSON.parse(val); } catch { return val; }
            },
        });

        self._observer = new MutationObserver(mutations => {
            if (self._isSyncing) return;
            for (const m of mutations) {
                const attr = m.attributeName;
                if (attr?.startsWith('data-')) {
                    const key = attr.slice(5).replace(/-./g, c => c[1].toUpperCase());
                    self._broadcast(key, self.state[key]);
                }
            }
        });
        // #endregion
    }

    connectedCallback() {
        this._observer.observe(this, { attributes: true });
        on('dw/log', console.log, '', this);
        wake(this);
        emit('dw/load', undefined, this);
        emit('load', undefined, this);   // fires the inline onload="" attribute
        if (this.hasAttribute('src')) queueMicrotask(() => this.load());
    }

    disconnectedCallback() {
        this._observer.disconnect();
    }

    // bus(path: string) {
    //     return this._subs[path];
    // }

    // pub(key: string, val: unknown) {
    //     for (const sub of this._subs[key]) sub(val); // run updater
    // }

    // sub(path: string, updater: Sub) {
    //     this._subs[path] = [...this._subs[path], updater]; // append subscriber.
    // }

    _broadcast(key: string, val: unknown) {
        broadcast(this._subs[key], val);
    }

    // #region state-api
    register(actions: Record<string, EventListener>) {
        for (const [eventType, cb] of Object.entries(actions)) {
            on(eventType, (e) => {
                if ((e.target as Element).closest('data-wrapper') !== this) return;
                cb(e);
            }, '', this);
        }
    }

    put(key: string, val: unknown | ((prev: unknown) => unknown)) {
        const next = typeof val === 'function'
            ? (val as (p: unknown) => unknown)(this.state[key])
            : val;
        if (this.state[key] === next) return;
        this.state[key] = next;
        emit('dw/sync', { key }, this);
    }

    patch(key: string, obj: Record<string, unknown>) {
        this.put(key, { ...(this.state[key] as Record<string, unknown> || {}), ...obj });
    }

    push(key: string, item: unknown) {
        this.put(key, [...(this.state[key] as unknown[] || []), item]);
    }

    pull(key: string, predicate: ((item: unknown) => boolean) | unknown) {
        const current = this.state[key] as unknown[] || [];
        const fn      = typeof predicate === 'function'
            ? (i: unknown) => !(predicate as (i: unknown) => boolean)(i)
            : (i: unknown) => (i as Record<string, unknown>).id !== predicate;
        this.put(key, current.filter(fn));
    }
    // #endregion

    // #region load
    async load(src: string | null = this.getAttribute('src')) {
        if (!src) return;
        const url = new URL(src, document.baseURI);

        if (/\.m?js$/.test(url.pathname)) {
            const mod = await import(url.href);
            await mod.default?.(this);
        } else {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`load ${url.href}: ${res.status}`);
            this.innerHTML = await res.text();
            this._subs = {};
            this._listCache = new Map();
            this.removeAttribute('_live');
            wake(this, null, this);
        }
        emit('dw/loaded', { src: url.href }, this);
    }
    // #endregion
}

if (typeof customElements !== 'undefined' && !customElements.get('data-wrapper')) {
    customElements.define('data-wrapper', DataWrapper);
    console.info(`<data-wrapper version="${v}">`);
}
