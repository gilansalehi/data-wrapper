import { emit, on, readPath, writePath, type Off } from './utils.ts';
import { wake, publishAxis, unwake } from './engine.ts';
import type { ListCache, Station } from './engine.ts';

export class DataWrapper extends HTMLElement {
    declare state:      Record<string, unknown>;
    declare _subs:      Station;  // radio station analogy
    declare _unsubs:    Off[];    // Offs for subscriptions that escape this wrapper's scope
    declare _isSyncing: boolean;
    declare _listCache: ListCache;
    declare _observer:  MutationObserver;

    constructor() {
        super();
        const self = this;

        self._subs      = {};
        self._unsubs    = [];
        self._listCache = new Map();
        self._isSyncing = false;

        // Attribute names we've already warned about in this session — one
        // warning per computed-bound key, not one per edit. Lives in the
        // constructor closure so it doesn't pollute the public Wrapper
        // contract; the wrapper's own DOM attributes are the registry of
        // which keys are computed.
        const warned = new Set<string>();

        // #region state-proxy
        // @docs State *is* `data-*`. The Proxy serializes objects as JSON on
        // write, parses them back on read. Writes publish on the *axis* of
        // the changed path — the channel itself, its ancestors (each a
        // composite containing the change), and its descendants when the
        // write replaces a subtree. Sibling channels are off-axis and stay
        // quiet. Precise paths come from `put()`, which knows the full P;
        // the Proxy setter and the `MutationObserver` only see the root key
        // and broadcast broadly on its axis. `_isSyncing` suppresses self-
        // echo so a write originating here doesn't fire twice through the
        // observer — and it gates the Proxy setter when `put()` is mid-
        // drain, since `put()` will publish precisely once `writePath()`
        // returns.
        self.state = new Proxy(self.dataset as unknown as Record<string, unknown>, {
            set(target, key: string, value: unknown) {
                const serialized = (value && typeof value === 'object')
                    ? JSON.stringify(value)
                    : String(value ?? '');

                const prevRaw = (target as DOMStringMap)[key];
                if (prevRaw === serialized) return true;

                (target as DOMStringMap)[key] = serialized;

                // A write that originated in `put()` will publish precisely
                // from there — the Proxy only sees the root key. Direct
                // writes (`state.x = y`) broadcast broadly on-axis here.
                if (!self._isSyncing) {
                    self._isSyncing = true;
                    publishAxis(self._subs, self.state, key);
                    queueMicrotask(() => { self._isSyncing = false; });
                }
                return true;
            },
            get(target, key: string) {
                const raw = (target as DOMStringMap)[key];
                if (raw == null) return undefined;
                try { return JSON.parse(raw); } catch { return raw; }
            },
        });

        self._observer = new MutationObserver(mutations => {
            if (self._isSyncing) return;
            for (const m of mutations) {
                const attr = m.attributeName;
                if (attr?.startsWith('data-')) {
                    const key = attr.slice(5).replace(/-./g, c => c[1].toUpperCase());

                    // DevTools-edit-wins: the external write proceeds and
                    // publishes normally, but if a `$data-*` declaration
                    // exists for this key, the value will be overwritten on
                    // the next upstream flush. The wrapper's own DOM is the
                    // registry — `hasAttribute('$data-…')` answers the
                    // question without any auxiliary state. Warn once per
                    // attribute per session.
                    if (self.hasAttribute('$' + attr) && !warned.has(attr)) {
                        console.warn(
                            `<data-wrapper>: external edit to "${attr}" will be ` +
                            `overwritten — it's bound by "$${attr}". Future external ` +
                            `writes to this key will not re-warn.`,
                        );
                        warned.add(attr);
                    }

                    publishAxis(self._subs, self.state, key);
                }
            }
        });
        // #endregion
    }

    connectedCallback() {
        this._observer.observe(this, { attributes: true, attributeOldValue: true });
        on('dw/log', console.log, '', this);
        wake(this);
        emit('dw/load', undefined, this);
        emit('load', undefined, this);   // fires the inline onload="" attribute
        if (this.hasAttribute('src')) queueMicrotask(() => this.load());
    }

    disconnectedCallback() {
        this._observer.disconnect();
    }

    // #region state-api
    // @docs Public surface for reading and writing wrapper state. Every
    // mutation routes through `put()`, which short-circuits no-op writes and
    // emits `dw/sync` so subscribers fan out exactly once.
    //  - `get` reads a path from state (single segment or slash-separated),
    //  - `patch` does a shallow merge,
    //  - `push` appends,
    //  - `pull` filters by id or predicate,
    //  - `register` attaches event handlers scoped to the wrapper.
    register(actions: Record<string, EventListener>) {
        for (const [eventType, cb] of Object.entries(actions)) {
            on(eventType, (e) => {
                if ((e.target as Element).closest('data-wrapper') !== this) return;
                cb(e);
            }, '', this);
        }
    }

    get(path: string): unknown {
        return readPath(this.state, path);
    }

    put(key: string, val: unknown | ((prev: unknown) => unknown)) {
        const prev = readPath(this.state, key);
        const next = typeof val === 'function'
            ? (val as (p: unknown) => unknown)(prev)
            : val;
        if (prev === next) return;

        // Raise `_isSyncing` so the Proxy setter (called inside `writePath`)
        // skips its broad publish — `put` knows the precise path and will
        // publish a tight spine itself. The flag stays raised across the
        // microtask boundary so the MutationObserver also sees self-writes
        // as synced and skips them.
        //
        // Only the *outermost* `put` queues the clear. Re-entrant or
        // microtask-spawned writes (e.g. flushComputeds calling `put`
        // after an outer `put`'s clear has run) detect the in-flight
        // syncing window and ride the existing clear. Otherwise their
        // mutation's MO microtask can fire *after* the outer clear has
        // run, and the framework's own write gets mis-seen as external —
        // which surfaces as a spurious "external edit will be overwritten"
        // warning for a key the framework wrote itself.
        const wasIdle = !this._isSyncing;
        this._isSyncing = true;
        writePath(this.state, key, next);
        publishAxis(this._subs, this.state, key);
        if (wasIdle) queueMicrotask(() => { this._isSyncing = false; });
        emit('dw/sync', { key }, this);
    }

    patch(key: string, obj: Record<string, unknown>) {
        this.put(key, { ...(readPath(this.state, key) as Record<string, unknown> || {}), ...obj });
    }

    push(key: string, item: unknown) {
        this.put(key, [...(readPath(this.state, key) as unknown[] || []), item]);
    }

    pull(key: string, predicate: ((item: unknown) => boolean) | unknown) {
        const current = readPath(this.state, key) as unknown[] || [];
        const fn      = typeof predicate === 'function'
            ? (i: unknown) => !(predicate as (i: unknown) => boolean)(i)
            : (i: unknown) => (i as Record<string, unknown>).id !== predicate;
        this.put(key, current.filter(fn));
    }
    // #endregion

    // #region load
    // @docs Loads content into the wrapper. A `.js` or `.mjs` source is
    // dynamically imported and its `default` export is invoked with the
    // wrapper as the only argument — handy for handler registration in a
    // separate file. Anything else is fetched as text, replaces `innerHTML`,
    // and re-wakes the subtree. Either path ends with a `dw/loaded` event
    // carrying the resolved URL.
    async load(src: string | null = this.getAttribute('src')) {
        if (!src) return;
        const url = new URL(src, document.baseURI);

        if (/\.m?js$/.test(url.pathname)) {
            const mod = await import(url.href);
            await mod.default?.(this);
        } else {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`load ${url.href}: ${res.status}`);
            unwake(this);
            this.innerHTML = await res.text();
            this._subs = {};
            this._unsubs = [];
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
}
