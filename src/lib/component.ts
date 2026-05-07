import { q, qcb, emit, on } from './utils.ts';
import { wakeTree } from './wire.ts';
import type { UpdateConfig } from './types.ts';

type ItemNode = Element & { _vItem?: Record<string, unknown> };
type VNode = Element & { _vBase?: Set<string>; _vState?: { dynamic: string; additive: string } };

export class DataWrapper extends HTMLElement {
    declare state: Record<string, unknown>;
    declare subs: Record<string, UpdateConfig[]>;
    declare _isSyncing: boolean;
    declare _listCache: Map<Element, Map<unknown, Element>>;
    declare observer: MutationObserver;

    constructor() {
        super();
        const self = this;

        self.subs = {};
        self._isSyncing = false;
        self._listCache = new Map();

        self.state = new Proxy(self.dataset as unknown as Record<string, unknown>, {
            set(target, key: string, value: unknown) {
                const serialized = (value && typeof value === 'object')
                    ? JSON.stringify(value)
                    : value;

                if ((target as DOMStringMap)[key] === String(serialized)) return true;

                self._isSyncing = true;
                (target as DOMStringMap)[key] = String(serialized);
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

        self.observer = new MutationObserver((mutations) => {
            if (self._isSyncing) return;
            for (const m of mutations) {
                const attr = m.attributeName;
                if (attr?.startsWith('data-')) {
                    const prop = attr.slice(5).replace(/-./g, match => match[1].toUpperCase());
                    self._notify(prop, self.state[prop]);
                }
            }
        });
    }

    connectedCallback() {
        this.observer.observe(this, { attributes: true });
        wakeTree(this, this);
        for (const key of Object.keys(this.dataset)) {
            this._notify(key, this.state[key]);
        }
        emit('data-wrapper:load', this);
    }

    disconnectedCallback() {
        this.observer.disconnect();
    }

    _notify(key: string, value: unknown) {
        const list = this.subs[key];
        if (!list) return;
        for (const config of list) {
            if (!config.el.isConnected) continue;
            let val = value;
            for (const pipe of config.pipes) val = pipe(val);
            const { el, prop, itemNode } = config;
            if (itemNode) val = (itemNode as ItemNode)._vItem?.[key] ?? val;

            if (prop === 'class') {
                const v = el as VNode;
                v._vBase = v._vBase ?? new Set([...el.classList]);
                const s = v._vState = v._vState ?? { dynamic: '', additive: '' };
                s.dynamic = String(val ?? '');
                el.className = ([...v._vBase].join(' ') + ` ${s.dynamic} ${s.additive}`).replace(/\s+/g, ' ').trim();
            } else if (prop in el) {
                (el as unknown as Record<string, unknown>)[prop] = val;
            } else {
                el.setAttribute(prop, String(val));
            }
        }
    }

    register(path: string, updater: UpdateConfig) {
        (this.subs[path] = this.subs[path] || []).push(updater);
        this._notify(path, this.state[path]);
    }

    put(key: string, val: unknown | ((prev: unknown) => unknown)) {
        const next = typeof val === 'function' ? (val as (p: unknown) => unknown)(this.state[key]) : val;
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
        const fn = typeof predicate === 'function'
            ? predicate as (i: unknown) => boolean
            : (i: unknown) => (i as Record<string, unknown>).id !== predicate;
        this.put(key, current.filter(fn));
    }

    parseDWRL(input: string, base?: string) {
        const url = new URL(input, base || 'dwrl://localhost/');
        return {
            authority: url.host,
            segments: url.pathname.split('/').filter(Boolean),
            property: url.hash.slice(1),
            params: Object.fromEntries([...url.searchParams]),
        };
    }

    q(selector: string) { return q(selector, this); }
    qcb(selector: string, cb?: (el: Element) => unknown) { return qcb(selector, cb, this); }
    on(eventName: string, cb: EventListener, delegate = '') { return on(eventName, cb, delegate, this); }
    emit(eventName: string, payload?: unknown) { return emit(eventName, payload, this); }
}

customElements.define('data-wrapper', DataWrapper);
