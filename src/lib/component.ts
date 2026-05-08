import { emit, on, q } from './utils.ts';
import { CONFIG, resolveDirective } from './registry.ts';
import { applyBinding, reconcile } from './engine.ts';
import { wake, ensureDelegation } from './wire.ts';
import type { UpdateConfig } from './engine.ts';

export class DataWrapper extends HTMLElement {
    declare state:        Record<string, unknown>;
    declare _subs:        Record<string, UpdateConfig[]>;
    declare _boundEvents: Set<string>;
    declare _isSyncing:   boolean;
    declare _listCache:   Map<Element, Map<unknown, Element>>;
    declare _observer:    MutationObserver;

    constructor() {
        super();
        const self = this;

        self._subs        = {};
        self._boundEvents = new Set();
        self._isSyncing = false;
        self._listCache = new Map();

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
    }

    connectedCallback() {
        this._observer.observe(this, { attributes: true });
        wake(this, null);
        for (const key of Object.keys(this.dataset)) this._broadcast(key, this.state[key]);
        emit('load', this, this);          // triggers onload="" attribute on the element
        emit('data-wrapper:load', this);   // document-level notification for external scripts
        if (this.hasAttribute('src')) queueMicrotask(() => this.load());
    }

    disconnectedCallback() {
        this._observer.disconnect();
    }

    _broadcast(key: string, val: unknown) {
        for (const config of this._subs[key] || []) {
            if (!config.el.isConnected) continue;
            let v = val;
            for (const pipe of config.pipes) v = pipe(v);
            if (config.directive) {
                const directive = resolveDirective(config.prop);
                if (!directive) continue;
                directive({
                    wrapper: this,
                    config,
                    value: v,
                    bindTemplateEvents: tpl => this._bindTemplateEvents(tpl),
                    renderList: (container, data, cache, tpl, itemKey) => reconcile(container, data, cache, tpl, wake, itemKey),
                });
            } else {
                applyBinding(config.el, config.prop, v);
            }
        }
    }

    _bindTemplateEvents(tpl: HTMLTemplateElement) {
        // Pre-register event types from template content so delegation works
        // even when items are woken while still detached from the DOM.
        const { EVT } = CONFIG.TOKENS;
        for (const el of q('*', tpl.content)) {
            for (const { name } of [...el.attributes]) {
                if (name.startsWith(EVT)) ensureDelegation(this, name.slice(EVT.length));
            }
        }
    }

    _sub(path: string, config: UpdateConfig) {
        (this._subs[path] = this._subs[path] || []).push(config);
        this._broadcast(path, this.state[path]);
    }

    register(actions: Record<string, EventListener>) {
        for (const [type, fn] of Object.entries(actions)) on(type, fn, '', this);
    }

    put(key: string, val: unknown | ((prev: unknown) => unknown)) {
        const next = typeof val === 'function'
            ? (val as (p: unknown) => unknown)(this.state[key])
            : val;
        if (this.state[key] === next) return;
        this.state[key] = next;
        emit('data:sync', { key }, this);
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
            wake(this, null);
            for (const key of Object.keys(this.dataset)) this._broadcast(key, this.state[key]);
        }
        emit('data:load', { src: url.href }, this);
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('data-wrapper')) {
    customElements.define('data-wrapper', DataWrapper);
}
