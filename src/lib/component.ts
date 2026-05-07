import { emit } from './utils.ts';
import { RENDER_DIRECTIVES } from './registry.ts';
import { applyBinding, reconcile } from './engine.ts';
import { wake } from './wire.ts';
import type { UpdateConfig } from './types.ts';

export class DataWrapper extends HTMLElement {
    declare state:        Record<string, unknown>;
    declare subs:         Record<string, UpdateConfig[]>;
    declare _actions:     Record<string, EventListener>;
    declare _boundEvents: Set<string>;
    declare _isSyncing:   boolean;
    declare _listCache:   Map<Element, Map<unknown, Element>>;
    declare observer:     MutationObserver;

    constructor() {
        super();
        const self = this;

        self.subs         = {};
        self._actions     = {};
        self._boundEvents = new Set();
        self._isSyncing   = false;
        self._listCache   = new Map();

        self.state = new Proxy(self.dataset as unknown as Record<string, unknown>, {
            set(target, key: string, value: unknown) {
                const serialized = (value && typeof value === 'object')
                    ? JSON.stringify(value)
                    : String(value ?? '');

                if ((target as DOMStringMap)[key] === serialized) return true;

                self._isSyncing = true;
                (target as DOMStringMap)[key] = serialized;
                self._notify(key, value);
                queueMicrotask(() => { self._isSyncing = false; });
                return true;
            },
            get(target, key: string) {
                const val = (target as DOMStringMap)[key];
                if (val === undefined) return undefined;
                try { return JSON.parse(val); } catch { return val; }
            },
        });

        self.observer = new MutationObserver(mutations => {
            if (self._isSyncing) return;
            for (const m of mutations) {
                const attr = m.attributeName;
                if (attr?.startsWith('data-')) {
                    const key = attr.slice(5).replace(/-./g, c => c[1].toUpperCase());
                    self._notify(key, self.state[key]);
                }
            }
        });
    }

    connectedCallback() {
        this.observer.observe(this, { attributes: true });
        wake(this, null);
        for (const key of Object.keys(this.dataset)) this._notify(key, this.state[key]);
        emit('data-wrapper:load', this);
    }

    disconnectedCallback() {
        this.observer.disconnect();
    }

    // Broadcasts a state change to all wrapper-scoped DOM subscribers for `key`.
    _notify(key: string, val: unknown) {
        for (const config of this.subs[key] || []) {
            if (!config.el.isConnected) continue;
            let v = val;
            for (const pipe of config.pipes) v = pipe(v);
            RENDER_DIRECTIVES.has(config.prop)
                ? this._runDirective(config, v)
                : applyBinding(config.el, config.prop, v);
        }
    }

    // Executes a render directive (list, and future: match, if).
    _runDirective(config: UpdateConfig, val: unknown) {
        if (config.prop === 'list') {
            const tpl = Array.from(config.el.children)
                .find(c => c.tagName === 'TEMPLATE') as HTMLTemplateElement | undefined;
            if (!tpl) return;
            let cache = this._listCache.get(config.el);
            if (!cache) { cache = new Map(); this._listCache.set(config.el, cache); }
            reconcile(config.el, (val as Array<Record<string, unknown>>) || [], cache, tpl, wake);
        }
    }

    // Internal: registers a DOM subscription and fires initial sync.
    _register(path: string, config: UpdateConfig) {
        (this.subs[path] = this.subs[path] || []).push(config);
        const val = this.state[path];
        if (val !== undefined) this._notify(path, val);
    }

    // Public: maps action:// path strings to handler functions.
    register(actions: Record<string, EventListener>) {
        Object.assign(this._actions, actions);
    }

    put(key: string, val: unknown | ((prev: unknown) => unknown)) {
        const next = typeof val === 'function'
            ? (val as (p: unknown) => unknown)(this.state[key])
            : val;
        if (this.state[key] === next) return;
        this.state[key] = next;
        this.dispatchEvent(new CustomEvent('data:sync', { detail: { key }, bubbles: true }));
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
            ? predicate as (i: unknown) => boolean
            : (i: unknown) => (i as Record<string, unknown>).id !== predicate;
        this.put(key, current.filter(fn));
    }
}

customElements.define('data-wrapper', DataWrapper);
