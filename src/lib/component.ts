import { emit, on, p, readPath, writePath, type Off } from './utils.ts';
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
        // `put:` is the write-direction protocol on `@`-events (RFC §5-§7).
        // wire() emits `put:` (as the literal event topic) when an `@`-pURL
        // has protocol `put:`; this listener consumes it and writes the
        // harvested value at the parsed path. Filtered by closest-wrapper so
        // nested wrappers don't double-handle.
        on('put:', (e) => {
            if ((e.target as Element).closest('data-wrapper') !== this) return; // <-- will this block put://host to a different wrapper?
            this.handlePut(e as CustomEvent);
        }, '', this);

        // Collect & remove this wrapper's own `<script type="dw/controller">`
        // children before wake, so they don't render and so wake skips them
        // naturally. Nested-wrapper-owned controllers are excluded — they run
        // when that nested wrapper connects.
        const controllers = this.collectControllers(this);
        controllers.forEach(s => s.remove());

        wake(this);
        emit('dw/load', undefined, this);
        // Non-bubbling to match native `load` semantics. emit() bubbles, which
        // would let a nested wrapper's `load` re-trigger ancestors' inline
        // onload="" handlers — registering the same actions twice.
        this.dispatchEvent(new Event('load'));

        // Fire-and-forget: `connectedCallback` can't be awaited by the browser.
        // Resolution emits `dw/ready`; rejection emits `dw/error` so consumers
        // have a real event to subscribe to instead of console-only failures.
        this.runControllers(controllers)
            .then (()  => emit('dw/ready', undefined, this))
            .catch(err => emit('dw/error', { error: err }, this));

        if (this.hasAttribute('src')) queueMicrotask(() => this.load());
    }

    disconnectedCallback() {
        this._observer.disconnect();
        emit('dw/disconnect', undefined, this);
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

    // @docs Handles a `put:` event dispatched by wire's `@`-branch when an
    // attribute uses the `put:` protocol. Extracts the value from the harvested
    // payload by the path's leaf segment (the "single named input" case) or
    // falls through to the whole payload (the "form" case, multi-key object).
    //
    // Absolute paths write through `this.put` directly. Relative paths
    // (`put:./done` inside a `*list` row) walk the DOM to find the row via
    // its `_key` marker (set by `reconcile`) and the containing `*list`
    // attribute, then perform an identity-keyed immutable update against
    // the wrapper's source array. The existing `publishAxis` cascade fans
    // the change back through every row subscriber automatically.
    handlePut(e: CustomEvent) {
        const { path, payload, isRel } = e.detail;
        const leaf  = path.split('/').pop()!;
        const value = (payload as Record<string, unknown>)[leaf] ?? payload;

        if (!isRel) {
            this.put(path, value);
            return;
        }

        // Row-relative branch: identity-keyed update through wrapper.put so
        // the publishAxis cascade re-broadcasts to row subscribers.
        const rowNode = (e.target as Element).closest('[_key]');
        if (!rowNode) {
            throw new Error(`put:./${path} fired outside a *list row context`);
        }
        const listEl  = rowNode.parentElement;
        const listAtt = listEl && [...listEl.attributes].find(a => a.name.startsWith('*list'));
        if (!listAtt) {
            throw new Error(`put:./${path} row not inside a *list container`);
        }
        const lst       = p(listAtt.value);
        const arrayPath = lst.path;
        const keyProp   = lst.key || 'id';
        const rowKey    = rowNode.getAttribute('_key')!;

        this.put(arrayPath, (prev: unknown) =>
            ((prev as Record<string, unknown>[]) || []).map(item => {
                if (String(item[keyProp]) !== rowKey) return item;
                const next = { ...item };
                writePath(next, path, value);
                return next;
            })
        );
    }
    // #endregion

    // #region load
    // @docs Loads content into the wrapper. A `.js` or `.mjs` source is
    // dynamically imported and its `default` export is invoked with the
    // wrapper as the only argument — handy for handler registration in a
    // separate file. Anything else is fetched as text, parsed into a fragment,
    // and re-wakes the subtree. `<script type="dw/controller">` blocks are
    // collected, removed from the fragment, and executed (after wake) with
    // the wrapper as their `this` context. Append `?run-scripts` to also
    // execute ordinary inline `<script>` tags before wake binds —
    // `innerHTML` alone leaves them inert. External `<script src>` is skipped
    // to keep wake's ordering invariants. Either path ends with `dw/loaded`.
    async load(src: string | null = this.getAttribute('src')) {
        if (!src) return;
        const url = new URL(src, document.baseURI);

        try {
            if (/\.m?js$/.test(url.pathname)) {
                const mod = await import(url.href);
                await mod.default?.(this);
            } else {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`load ${url.href}: ${res.status}`);

                const html = await res.text();
                const tpl  = document.createElement('template');
                tpl.innerHTML = html;

                // Pull this wrapper's own controllers out of the fragment before
                // insertion — they shouldn't render and shouldn't be picked up
                // by the legacy `runScripts()` pass. Nested-wrapper-owned
                // controllers stay; they execute when that nested wrapper loads.
                const controllers = this.collectControllers(tpl.content);
                controllers.forEach(s => s.remove());

                unwake(this);
                this.innerHTML = '';
                this.append(tpl.content);
                this._subs = {};
                this._unsubs = [];
                this._listCache = new Map();
                this.removeAttribute('_live');
                if (url.searchParams.has('run-scripts')) runScripts(this);
                wake(this, null, this);
                await this.runControllers(controllers);
            }
        } catch (err) {
            emit('dw/error', { src: url.href, error: err }, this);
            throw err;
        }
        // `dw/loaded` = the fetch + swap completed. `dw/ready` = the wrapper is
        // fully alive, including any awaited controllers. Both fire in order
        // so consumers can pick the granularity they need.
        emit('dw/loaded', { src: url.href }, this);
        emit('dw/ready',  undefined,        this);
    }
    // #endregion

    // #region controllers
    // @docs `<script type="dw/controller">` is the canonical, framework-owned
    // mechanism for inline init code in a loaded or inline-rendered wrapper.
    // It runs after `wake()` with `this === wrapper`, plus a prepended intro
    // that binds the wrapper's state-API methods so destructure-from-`this`
    // preserves the binding (the methods are prototype methods; destructure
    // alone would strip `this`). Errors at load-time propagate through the
    // `load()` rejection; at connect time, they're caught and logged until
    // dw/error lifecycle wiring lands.
    private collectControllers(root: Element | DocumentFragment): HTMLScriptElement[] {
        const scripts = [...root.querySelectorAll('script[type="dw/controller"]')] as HTMLScriptElement[];
        return scripts.filter(s => {
            // Inline (root === this): controller's closest data-wrapper must
            // be `this` (not a nested descendant). Fragment: closest must be
            // null (no nested wrapper between script and fragment root).
            const ancestor = s.closest('data-wrapper');
            return root === this ? ancestor === this : ancestor === null;
        });
    }

    private async runControllers(scripts: HTMLScriptElement[]) {
        for (const [i, s] of scripts.entries()) {
            const intro = (
                'const wrapper  = this;' +
                'const state    = this.state;' +
                'const put      = this.put.bind(this);' +
                'const patch    = this.patch.bind(this);' +
                'const push     = this.push.bind(this);' +
                'const pull     = this.pull.bind(this);' +
                'const register = this.register.bind(this);' +
                'const get      = this.get.bind(this);'
            );
            const sourceURL = `\n//# sourceURL=dw:${this.id || 'anon'}:${i}`;
            const fn = new Function(`'use strict';\n${intro}\n${s.textContent ?? ''}${sourceURL}`);
            await fn.call(this);
        }
    }
    // #endregion
}

// Browsers don't execute `<script>` tags inserted via `innerHTML`; replacing
// each one with a freshly created copy is the standard workaround. Inline-only:
// `<script src>` would fetch async and race with wake's binding pass. Scripts
// nested inside descendant wrappers are skipped — those wrappers run their own.
// `type="dw/controller"` scripts are also skipped: those are handled by the
// dedicated `runControllers()` path. In normal flow they're already removed
// from the DOM before `runScripts()` runs; the filter is defense-in-depth in
// case anyone calls `runScripts()` directly on a controller-bearing subtree.
const runScripts = (wrapper: Element) => {
    for (const oldScript of wrapper.querySelectorAll('script')) {
        if (oldScript.hasAttribute('src')) continue;
        if (oldScript.getAttribute('type') === 'dw/controller') continue;
        if (oldScript.closest('data-wrapper') !== wrapper) continue;
        const newScript = document.createElement('script');
        for (const { name, value } of oldScript.attributes) {
            newScript.setAttribute(name, value);
        }
        newScript.textContent = oldScript.textContent;
        oldScript.replaceWith(newScript);
    }
};

if (typeof customElements !== 'undefined' && !customElements.get('data-wrapper')) {
    customElements.define('data-wrapper', DataWrapper);
}
