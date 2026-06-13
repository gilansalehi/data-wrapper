import { emit, on, p, readPath, writePath, type Off } from './utils.ts';
import { wake, publishAxis, unwake } from './engine.ts';
import type { ListCache, Station } from './engine.ts';
import { ComponentRuntime, type ComponentModule } from './component-runtime.ts';

export class DataWrapper extends HTMLElement {
    declare state:      Record<string, unknown>;
    declare _subs:      Station;  // radio station analogy
    declare _unsubs:    Off[];    // Offs for subscriptions that escape this wrapper's scope
    declare _isSyncing: boolean;
    declare _listCache: ListCache;
    declare _observer:  MutationObserver;
    declare _component?: ComponentRuntime;
    declare _loadedSrc?: string;
    declare _destroying?: Promise<void>;

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

        wake(this);
        emit('dw/load', undefined, this);
        // Non-bubbling to match native `load` semantics. emit() bubbles, which
        // would let a nested wrapper's `load` re-trigger ancestors' inline
        // onload="" handlers — registering the same actions twice.
        this.dispatchEvent(new Event('load'));

        // Keep ready asynchronous so listeners observe the stable ordering
        // `dw/load` → native `load` → `dw/ready`. A reconnect also reloads the
        // last component-backed HTML source, including sources passed directly
        // to load(), so a runtime destroyed on disconnect is recreated.
        const src = this.getAttribute('src') || this._loadedSrc;
        if (!src) {
            queueMicrotask(() => emit('dw/ready', undefined, this));
        } else {
            queueMicrotask(() => this.load(src));
        }
    }

    disconnectedCallback() {
        this._observer.disconnect();
        if (this._component) unwake(this);
        void this.destroyComponent().catch(error => {
            emit('dw/error', { phase: 'destroy', error }, this);
        });
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
    //  - `register` attaches event handlers scoped to the wrapper and returns
    //    one cleanup that removes the registered batch.
    register(actions: Record<string, EventListener>): Off {
        const offs: Off[] = [];
        for (const [eventType, cb] of Object.entries(actions)) {
            offs.push(on(eventType, (e) => {
                if ((e.target as Element).closest('data-wrapper') !== this) return;
                cb(e);
            }, '', this));
        }
        return () => {
            for (const off of offs) off();
            offs.length = 0;
        };
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
    // @docs Loads content into the wrapper. Loaded HTML may contain one owned
    // inline `<script type="module" data-component>` block. The loader removes
    // it, imports it through a unique Blob URL, and attaches a component runtime
    // before wake so bare `$` outputs and `@` actions can resolve its live
    // exports. The runtime's `mount(context)` hook runs after wake; reload and
    // disconnect destroy the previous runtime. Append `?run-scripts` to also
    // execute ordinary inline scripts before wake. A `.js` or `.mjs` source
    // still imports and invokes its default export with the wrapper. Every
    // successful path ends with `dw/loaded`, then `dw/ready`.
    async load(src: string | null = this.getAttribute('src')) {
        if (!src) return;
        const url = new URL(src, document.baseURI);
        let nextComponent: ComponentRuntime | undefined;

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

                const componentScripts = this.collectComponentModules(tpl.content);
                if (componentScripts.length > 1) {
                    throw new Error('Only one inline component module is supported per loaded view');
                }
                const componentScript = componentScripts[0];
                if (componentScript?.hasAttribute('src')) {
                    throw new Error('External component modules are not supported yet');
                }
                componentScript?.remove();
                const componentModule = componentScript
                    ? await this.importComponentModule(componentScript, url)
                    : undefined;

                unwake(this);
                await this.destroyComponent();
                this.innerHTML = '';
                this.append(tpl.content);
                this._subs = {};
                this._unsubs = [];
                this._listCache = new Map();
                nextComponent = componentModule
                    ? new ComponentRuntime(this, componentModule)
                    : undefined;
                this._component = nextComponent;
                this.removeAttribute('_live');
                if (url.searchParams.has('run-scripts')) runScripts(this);
                wake(this, null, this);
                await nextComponent?.mount();
                this._loadedSrc = componentModule ? url.href : undefined;
            }
        } catch (err) {
            if (nextComponent && this._component === nextComponent) {
                unwake(this);
                this._component = undefined;
                try {
                    await nextComponent.destroy();
                } catch (destroyError) {
                    emit('dw/error', {
                        phase: 'destroy',
                        src: url.href,
                        error: destroyError,
                    }, this);
                }
            }
            emit('dw/error', { src: url.href, error: err }, this);
            throw err;
        }
        // `dw/loaded` = the fetch + swap completed. `dw/ready` = the wrapper is
        // fully alive. Both fire in order so consumers can pick granularity.
        emit('dw/loaded', { src: url.href }, this);
        emit('dw/ready',  undefined,        this);
    }
    // #endregion

    private collectComponentModules(root: DocumentFragment): HTMLScriptElement[] {
        const scripts = [
            ...root.querySelectorAll('script[type="module"][data-component]'),
        ] as HTMLScriptElement[];
        return scripts.filter(script => script.closest('data-wrapper') === null);
    }

    private async importComponentModule(
        script: HTMLScriptElement,
        source: URL,
    ): Promise<ComponentModule> {
        const label = script.dataset.component || this.id || 'anonymous';
        const sourceURL = `\n//# sourceURL=${source.href}#${label}`;
        const blob = new Blob([script.textContent ?? '', sourceURL], {
            type: 'text/javascript',
        });
        const blobURL = URL.createObjectURL(blob);
        try {
            return await import(blobURL) as ComponentModule;
        } finally {
            URL.revokeObjectURL(blobURL);
        }
    }

    private destroyComponent(): Promise<void> {
        if (this._destroying) return this._destroying;
        const component = this._component;
        this._component = undefined;
        if (!component) return Promise.resolve();

        const destroying = component.destroy().finally(() => {
            if (this._destroying === destroying) this._destroying = undefined;
        });
        this._destroying = destroying;
        return destroying;
    }

}

// Browsers don't execute `<script>` tags inserted via `innerHTML`; replacing
// each one with a freshly created copy is the standard workaround. Inline-only:
// `<script src>` would fetch async and race with wake's binding pass. Scripts
// nested inside descendant wrappers are skipped — those wrappers run their own.
const runScripts = (wrapper: Element) => {
    for (const oldScript of wrapper.querySelectorAll('script')) {
        if (oldScript.hasAttribute('src')) continue;
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
