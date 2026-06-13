import { cloneTemplate, DW_DIRECTIVES, DW_FORMATTERS, DW_PROTOCOLS, PROP_ALIASES, resolveTemplate } from './registry.ts';
import type { DirectiveHandler, DispatchDetail, DispatchPayload, Item, ProtocolHandler, Resolution, Row, Source, Station, Sub, Subs, Wrapper } from './registry.ts';
import { p, on, emit, readPath, type Off, type pURL } from './utils.ts';

export type { Item, ListCache, Row, Station, Sub, Subs, Wrapper } from './registry.ts';

const set = (el: Element, prop: string, val: unknown) => {
    if (val === undefined || val === null) return;
    if (prop in el) {
        (el as unknown as Record<string, unknown>)[prop] = val;
    } else {
        el.setAttribute(prop, String(val));
    }
};

// two special cases, otherwise just a propAlias lookup and setter binding.
export const bind = (el: Element, prop: string): Sub => {
    if (prop === 'class') {
        const base = el.className;
        return val => {
            if (val === undefined || val === null) return;
            set(el, 'className', (base + ' ' + String(val)).replace(/\s+/g, ' ').trim());
        };
    }

    // `$data-*` on a `<data-wrapper>` is a computed-value declaration: the
    // wrapper subscribes to its own dataset slot through the same `$`-binding
    // primitive every other DOM property uses. Routing through `put()` (not
    // `setAttribute`) keeps the JSON-serialize-on-write contract; the cascade
    // for downstream subscribers falls out of `put()` calling `publishAxis()`.
    // No new abstraction layer — same shape as the `class` branch above.
    if (el.tagName === 'DATA-WRAPPER' && prop.startsWith('data-')) {
        const wrapper = el as Wrapper;
        const dsKey = prop.slice(5).replace(/-./g, c => c[1].toUpperCase());
        return val => wrapper.put(dsKey, val);
    }

    const alias = PROP_ALIASES[prop] || prop;
    return val => set(el, alias, val);
};

// #region subscriptions
// @docs The framework's update primitive. `subscribe()` adds a sub to a
// Station channel, runs it once for the initial render, and returns an `Off`
// that detaches it again — `unsubscribe()` is the splice, kept reference-based
// (never index-based) so repeated calls and out-of-order teardown stay correct.
// `publish()` calls every sub on a channel with a new value, iterating a
// snapshot so a sub that detaches another mid-broadcast can't corrupt the pass.
// `publishAxis()` lifts that primitive to deep paths: a write at path P
// publishes to every on-axis channel — P, its ancestors, its descendants —
// using pure string math on the channel name. Siblings stay quiet.
// Teardown mirrors the build: `unwire()` runs a batch of `Off`s and clears the
// list; `unwake()` tears down a whole wrapper — its own escaped subscriptions
// and every cached `*list` row's. A Station is `Record<channel, Subs>` — the
// wrapper has one (`_subs`) and every row carries its own (`row.subs`).
// Bindings, directives, and list rows all compose from this primitive.
export const subscribe = (station: Station, channel: string, sub: Sub, value: unknown): Off => {
    const subs = (station[channel] ??= []);
    subs.push(sub);
    sub(value);
    return () => unsubscribe(sub, subs);
};

// Detach a sub from its channel. Reference-based and idempotent: a second
// call finds nothing and no-ops, and unrelated splices can't desync it.
export const unsubscribe = (sub: Sub, subs: Subs) => {
    const i = subs.indexOf(sub);
    if (i !== -1) subs.splice(i, 1);
};

export const publish = (station: Station, channel: string, value: unknown) => {
    const subs = [...(station[channel] ?? [])]; // snapshot
    for (const sub of subs) sub(value);
};

// A write at path P affects exactly the channels on P's vertical axis: P
// itself, its ancestors (each a composite containing the change), and any
// descendants (which exist only when the write replaces a subtree). Sibling
// channels — neither containing nor contained by P — are off-axis. The
// membership test is pure string math on the channel name; no value diff,
// no parse of the old state. Exported as a pure predicate; `publishAxis()`
// has its own faster path that doesn't iterate to find ancestors.
export const onAxis = (channel: string, P: string): boolean =>
    channel === P
    || channel.startsWith(P + '/')   // channel is a descendant of P
    || P.startsWith(channel + '/');  // channel is an ancestor of P

// Publish a write at path P to every on-axis channel in `station`. The
// spine (P and every ancestor) is generated from P alone — O(depth) hash
// lookups, no iteration. Descendants require a station scan because they
// depend on what's subscribed, not on P. Together: O(depth + |station|),
// down from O(|station|) with a three-clause string predicate per channel.
// Callers pass whatever P they have: `put()` knows the precise path (tight
// spine, usually no descendants); the Proxy set and `MutationObserver`
// only see the root key (broad subtree fan).
export const publishAxis = (station: Station, state: unknown, P: string) => {
    // Spine: P, then walk up by stripping trailing path segments.
    let channel = P;
    while (channel) {
        if (channel in station) publish(station, channel, readPath(state, channel));
        const slash = channel.lastIndexOf('/');
        if (slash === -1) break;
        channel = channel.slice(0, slash);
    }

    // Descendants: scan the station once with a single prefix check.
    const prefix = P + '/';
    for (const ch in station) {
        if (ch.startsWith(prefix)) publish(station, ch, readPath(state, ch));
    }
};

// Run a batch of `Off`s and clear the list — the inverse of the wiring that
// filled it. Idempotent: each `Off` is, and the emptied list re-runs to nothing.
export const unwire = (unsubs: Off[]) => {
    for (const off of unsubs) off();
    unsubs.length = 0;
};

// Tear down every escaping subscription a wrapper accumulated — its own and
// each cached `*list` row's. The inverse of waking the wrapper's subtree.
export const unwake = (wrapper: Wrapper) => {
    for (const cache of wrapper._listCache.values()) {
        for (const row of cache.values()) unwire(row.unsubs);
    }
    unwire(wrapper._unsubs);
};
// #endregion

// #region reconcile
// @docs How `*list` stays cheap. `reconcile()` walks incoming items, reuses
// cached rows by identity key, publishes the updated item into each row's
// subscribers (no DOM rebuild for unchanged rows), removes rows whose ids
// dropped out, and appends new rows through a `DocumentFragment` before waking
// them. The DOM node is rendered output; the row record is the framework state.
export const reconcile = (
    container: Element,
    data: Item[],
    cache: Map<unknown, Row>,
    tpl: HTMLTemplateElement,
    keyProp = 'id',
) => {
    const activeIds = new Set<unknown>();
    const fragment  = document.createDocumentFragment();
    const newRows: Row[] = [];

    for (const item of data) {
        const id  = item[keyProp] ?? JSON.stringify(item);
        activeIds.add(id);

        let row   = cache.get(id);
        let isNew = false;

        if (!row) {
            row = {
                node: cloneTemplate(tpl)!,
                item,
                subs: {},
                unsubs: [],
            };
            // Identity marker for the put: listener's row-relative branch
            // (RFC §8.1). DOM-only lookup — handlePut walks `closest('[_key]')`
            // from the firing element to find the containing row, no
            // WeakMap or parallel JS cache needed.
            row.node.setAttribute('_key', String(id));
            cache.set(id, row);
            isNew = true;
            newRows.push(row);
        }

        row.item = item;
        if (!isNew) {
            for (const channel in row.subs) publish(row.subs, channel, readPath(item, channel));
        }
        fragment.appendChild(row.node);
    }

    cache.forEach((row, id) => {
        if (!activeIds.has(id)) { unwire(row.unsubs); row.node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
    for (const row of newRows) wake(row.node, row);
};
// #endregion

// #region list-directive
// @docs Reconciles a child `<template>` against an array. Reuses rows by
// identity (default key `id`; override with `?key=field`), publishes updated
// values into existing row subscribers, and renders a `data-empty` template
// when the array is empty.
const listDirective: DirectiveHandler = ({ wrapper, el, key, wake }) => {
    const tpl = el.querySelector(':scope > template') as HTMLTemplateElement | null;
    if (!tpl) return () => {};

    let cache = wrapper._listCache.get(el);
    if (!cache) {
        cache = new Map();
        wrapper._listCache.set(el, cache);
    }

    const identityKey = key || 'id';
    let emptyNode: Element | null = null;

    const clearRows = () => {
        cache.forEach(row => { unwire(row.unsubs); row.node.remove(); });
        cache.clear();
    };

    const showEmpty = () => {
        if (emptyNode?.parentElement === el) return;

        const emptyName = el.getAttribute('data-empty') || 'dw-empty';
        const emptyTpl  = resolveTemplate(emptyName);
        emptyNode = cloneTemplate(emptyTpl);
        if (!emptyNode) return;

        emptyNode.setAttribute('_empty', '');
        el.appendChild(emptyNode);
        wake(emptyNode);
    };

    const hideEmpty = () => {
        emptyNode?.remove();
        emptyNode = null;
    };

    return value => {
        const items = Array.isArray(value) ? value : [];

        if (items.length === 0) {
            clearRows();
            showEmpty();
            return;
        }

        hideEmpty();
        reconcile(el, items, cache, tpl, identityKey);
    };
};
// #endregion

// #region if-directive
// @docs Toggles an element's presence in the DOM. When the value is falsy,
// the element is replaced with a comment anchor; when truthy, it returns to
// its place and re-wakes. Useful for conditionally rendered fragments inside
// list rows or wrapper roots.
const ifDirective: DirectiveHandler = ({ wrapper, el, row, wake }) => {
    const anchor = document.createComment('dw-if');

    const show = () => {
        if (el.isConnected) return;
        anchor.replaceWith(el);
        wake(el, row ?? null, wrapper);
    };

    const hide = () => {
        if (!el.isConnected) return;
        el.replaceWith(anchor);
    };

    return value => {
        if (value) show();
        else hide();
    };
};
// #endregion

DW_DIRECTIVES.set('list', listDirective);
DW_DIRECTIVES.set('if', ifDirective);

type Format = (value: unknown) => unknown;

export type WrapperNode = Wrapper;

// ---------------------------------------------------------------------------
// DWRL parsing — native new URL() is the entire parser
// ---------------------------------------------------------------------------

const NO_WAKE   = ['DATA-WRAPPER', 'TEMPLATE', 'SVG'];
const LIVE      = '_live';
const TOKENS    = '@$*';
const HOST_SELF = 'data-wrapper';   // the DWRL_BASE hostname — a plain path's default host
const BARE_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:[?#].*)?$/;

// #region pURL
// @docs pURL drives the framework's wire surface — `pURL()` in `utils.ts`
// does the parsing; these helpers consume the result. `formatter()`
// compiles a pURL's query string into a left-to-right pipeline at wake
// time, so runtime updates never look up formatters again. Each
// `?key=value` is dispatched as a formatter named by the key with the
// value as its argument; the legacy `?format=name` is a meta-key that
// applies the named formatter with no argument. Framework-level keys
// (`key`, `prevent`, `stop`, `immediate`) are reserved and skipped.
// `collectPayload()` packs the data `@`-events ride with: a full
// FormData dump from `<form>`, or `{name: value}` from anything else
// with a `name` attribute.
const RESERVED_PARAMS = new Set(['key', 'prevent', 'stop', 'immediate']);

const formatter = (params: URLSearchParams, wrapper: WrapperNode | null = null): Format => {
    type Step = (v: unknown) => unknown;
    const steps: Step[] = [];

    for (const [key, val] of params) {
        if (key === 'format') {
            // Legacy: `format=NAME` applies the named formatter with no arg.
            const fn = DW_FORMATTERS.get(val);
            if (fn) steps.push(v => fn(v));
            continue;
        }
        if (RESERVED_PARAMS.has(key)) continue;
        const fn = DW_FORMATTERS.get(key);
        if (!fn) continue;
        // A param value that looks like a local-absolute pURL (`/path`)
        // is resolved against the wrapper at fire time and the resolved
        // value is handed to the formatter instead of the raw string.
        // Relative paths (`./…`) are scope-dependent and left to the
        // formatter to handle; cross-host paths (`//host/…`) too.
        if (wrapper && val.startsWith('/') && !val.startsWith('//')) {
            const argPath = val.slice(1);
            steps.push(v => fn(v, readPath(wrapper.state, argPath)));
            continue;
        }
        steps.push(v => fn(v, val));
    }

    return value => steps.reduce((v, step) => step(v), value);
};

// Two cases where `el.value` is genuinely wrong: checkboxes (boolean state,
// not the `value=""` attribute string), and `<select multiple>` (array of
// selected, not just the first). Everything else (text, number, range, date,
// radio) round-trips via `el.value` and dataset JSON parses on read.
const elementValue = (el: Element): unknown => {
    const i = el as HTMLInputElement;
    if (i.type === 'checkbox')                          return i.checked;
    if (el instanceof HTMLSelectElement && el.multiple) return [...el.selectedOptions].map(o => o.value);
    return (el as HTMLInputElement | HTMLTextAreaElement).value;
};

const collectPayload = (el: Element): DispatchPayload => {
    if (el instanceof HTMLFormElement) {
        const out: DispatchPayload = {};
        for (const child of el.elements) {
            const c = child as HTMLInputElement;
            if (!c.name) continue;
            if (c.type === 'radio' && !c.checked) continue;   // only the checked radio in a group
            out[c.name] = elementValue(c);
        }
        return out;
    }
    const ni = el as HTMLInputElement;
    return ni.name ? { [ni.name]: elementValue(ni) } : {};
};
// #endregion

// #region wire
// @docs The token dispatch. `wire()` runs once per tokenized attribute and
// turns it into a subscriber. `$prop` binds a Source to a DOM property,
// `*directive` invokes a registered structural directive, and `@event`
// delegates a native DOM event to an emitted topic. In a loaded component,
// bare `$` and `*` names resolve to matching module exports, and a bare `@`
// topic activates a matching exported function. Explicit pURLs keep their
// existing wrapper, row, protocol, and cross-wrapper meanings. A subscription
// that escapes the element's own scope has its `Off` recorded on the scope's
// `unsubs` so eviction can tear it down. Three tokens, one function, no runtime
// parsing past wake.

// Resolve a DWRL host to its wrapper. The default sentinel keeps the local
// wrapper; a named host is looked up by id and must already be upgraded.
const resolveHost = (host: string, local: WrapperNode): WrapperNode | null => {
    if (host === HOST_SELF) return local;
    const found = document.getElementById(host);
    if (found && '_subs' in found) return found as WrapperNode;
    console.warn(`<data-wrapper>: host "${host}" not found or not yet upgraded`);
    return null;
};

// @docs Internal handler interface used by the unified Source pipeline.
// `DEFAULT_HANDLER` implements the dwrl: protocol (read/write/subscribe
// against wrapper or row state). `toHandler` bridges registered
// ProtocolHandler entries from DW_PROTOCOLS into the same shape. The
// distinction between "state-channel source" and "protocol-handler source"
// dissolves at the call site — resolve() looks up a handler and wraps its
// three methods with the bound ctx.
type HandlerCtx = {
    wrapper: WrapperNode;     // local wrapper (formatter context, protocol-handler ops)
    target:  WrapperNode;     // host-resolved wrapper (state-channel ops)
    row:     Row | null;      // row context if firing element is inside *list
};

type Handler = {
    read:      (dwrl: pURL, ctx: HandlerCtx)             => unknown;
    write:     (dwrl: pURL, v: unknown, ctx: HandlerCtx) => void;
    subscribe: (dwrl: pURL, cb: Sub, ctx: HandlerCtx)    => Off;
};

const DEFAULT_HANDLER: Handler = {
    read: (dwrl, { target, row }) => {
        const scoped = row && dwrl.isRel;
        return readPath(scoped ? row.item : target.state, dwrl.path);
    },
    write: (dwrl, v, { target, row }) => {
        const scoped = row && dwrl.isRel;
        if (scoped) {
            // Row-scoped writes via state-channel: identity-keyed immutable
            // update against the parent array. Pending RFC §8.1 — the put:
            // listener is what would invoke this and it doesn't exist yet.
            throw new Error('row-scoped state-channel write: pending RFC §8.1');
        }
        target.put(dwrl.path, v);
    },
    subscribe: (dwrl, cb, { target, row }) => {
        const scoped  = row && dwrl.isRel;
        const station = scoped ? row.subs : target._subs;
        const state   = scoped ? row.item : target.state;
        return subscribe(station, dwrl.path, cb, readPath(state, dwrl.path));
    },
};

// Bridge a registered ProtocolHandler (function or {read, write?}) into the
// canonical Handler shape. Protocol handlers don't track reactivity — their
// subscribe fires once with the read value and returns a noop. Write is
// total — handlers that only expose read get a noop write.
const toHandler = (ph: ProtocolHandler): Handler => {
    const read  = typeof ph === 'function' ? ph : ph.read;
    const write = typeof ph === 'function' ? undefined : ph.write;
    return {
        read:      (dwrl, { wrapper }) => read(dwrl, wrapper),
        write:     write ? (dwrl, v, { wrapper }) => write(dwrl, v, wrapper) : () => {},
        subscribe: (dwrl, cb, { wrapper }) => { cb(read(dwrl, wrapper)); return () => {}; },
    };
};

// Resolve a parsed pURL to a Source. Looks up the handler (DEFAULT_HANDLER
// for dwrl:, registered handler from DW_PROTOCOLS otherwise), wraps its
// three methods with the bound ctx. Returns null for unknown protocols,
// unresolvable hosts, and path-less default-protocol pURLs — wire() skips
// those silently.
const resolve = (
    dwrl: pURL,
    ctx: { wrapper: WrapperNode; row: Row | null },
): Resolution | null => {
    const { protocol, isRel, host } = dwrl;
    const { wrapper, row } = ctx;

    const isDefault = protocol === 'dwrl:';

    // State-channel sources need a path to address; protocol handlers
    // encode their addressing differently (e.g. localstorage:// uses host).
    if (isDefault && !dwrl.path) return null;

    const handler = isDefault
        ? DEFAULT_HANDLER
        : (() => {
            const ph = DW_PROTOCOLS.get(protocol.slice(0, -1));
            return ph ? toHandler(ph) : null;
        })();
    if (!handler) return null;

    const target = isDefault ? resolveHost(host, wrapper) : wrapper;
    if (!target) return null;

    const scoped  = !!(row && isRel && isDefault);
    const station = scoped ? row!.subs : target._subs;
    const escapes = station !== (row ? row.subs : wrapper._subs);

    const handlerCtx: HandlerCtx = { wrapper, target, row };
    const source: Source = {
        read:      ()   => handler.read(dwrl, handlerCtx),
        write:     (v)  => handler.write(dwrl, v, handlerCtx),
        subscribe: (cb) => handler.subscribe(dwrl, cb, handlerCtx),
        escapes,
    };
    return { source, target };
};

export const wire = (
    el: Element,
    attr: Attr,
    row: Row | null = null,
    wrapper: WrapperNode | null = el.closest('data-wrapper')
) => {
    const { name, value } = attr;
    const token = name[0];
    const prop  = name.slice(1);

    const dwrl = p(value);
    const { path, isRel, params, host, protocol } = dwrl;
    if (!wrapper) return;

    // Teardown handles live on the element's scope: its *list row, else the wrapper.
    const unsubs = row ? row.unsubs : wrapper._unsubs;

    if (token === '@') {
        // A plain topic bubbles from the declaring element; a `//host/` topic
        // is re-dispatched onto the named wrapper. The native-event listener
        // stays on the local wrapper either way — the host is not a DOM
        // ancestor of `el` — so its Off is always kept for local teardown.
        //
        // Non-default protocols (`put:`, future `push:`/`pull:`/`patch:`)
        // dispatch under the protocol name as the event topic; the wrapper's
        // auto-registered `put:` listener interprets the detail. Default
        // protocol (`dwrl:`) dispatches under the path — the legacy
        // callback-handler topic convention.
        if (!path) return;
        // Empty host (opaque non-default protocols like `put:./done`) and
        // HOST_SELF (default-protocol same-wrapper topics) both dispatch from
        // `el`: the event bubbles to the wrapper, and `e.target` is the
        // firing element — what `handlePut`'s `closest('[_key]')` walk needs
        // to find the row context for relative paths.
        const sink = (host === HOST_SELF || !host) ? el : resolveHost(host, wrapper);
        if (!sink) return; // named host absent — resolveHost has warned

        const off = on(prop, (e) => {
            if (params.has('prevent'))   e.preventDefault();
            if (params.has('stop'))      e.stopPropagation();
            if (params.has('immediate')) e.stopImmediatePropagation();

            const detail: DispatchDetail = {
                originalEvent: e,
                payload: collectPayload(el),
                path,
                isRel,
            };
            emit(protocol === 'dwrl:' ? path : protocol, detail, sink);
        }, el, wrapper);

        unsubs.push(off);
        if (BARE_NAME.test(value)) {
            const actionOff = wrapper._component?.activateAction(path);
            if (actionOff) unsubs.push(actionOff);
        }
        return;
    }

    // `$` and `*` both consume a source via `resolve()`. The resolver
    // returns null for unknown protocols, unresolvable hosts, and
    // path-less default-protocol pURLs — wire() skips those silently.
    const componentSource = (token === '$' || token === '*')
        && BARE_NAME.test(value)
        && wrapper._component?.has(path)
        ? { source: wrapper._component.source(path), target: wrapper }
        : null;
    const r = componentSource ?? resolve(dwrl, { wrapper, row });
    if (!r) return;
    const { source, target } = r;

    if (token === '$') {
        const format = formatter(params, target);
        const set    = bind(el, prop);
        const sub    = (v: unknown) => set(format(v));

        const off = source.subscribe(sub);
        if (source.escapes) unsubs.push(off);

        // Non-default-protocol source + wrapper-data-* sink = bidirectional
        // binding. Composes a writeback subscription on the wrapper's state
        // channel for this dataset key. Init-fires once with the value just
        // put there from the source read — idempotent for localStorage;
        // other protocols decide their own write semantics. In-scope sub
        // (subscribes to wrapper._subs), wiped on `load()` like any
        // state-channel sub — no Off to track.
        //
        // Gated on protocol identity, not on `source.write` truthiness:
        // every Source now has a total `write`, but default-protocol
        // writeback would mean `$data-foo="/bar"` re-triggers `bar` whenever
        // `foo` changes — a cycle. Only non-default protocols explicitly
        // opt into the bidirectional contract.
        if (dwrl.protocol !== 'dwrl:' && el === wrapper && prop.startsWith('data-')) {
            const dsKey = prop.slice(5).replace(/-./g, c => c[1].toUpperCase());
            subscribe(wrapper._subs, dsKey, source.write, readPath(wrapper.state, dsKey));
        }
        return;
    }

    if (token === '*') {
        const updater = DW_DIRECTIVES.get(prop)?.({ ...dwrl, wrapper, el, row, wake });
        if (!updater) throw new Error(`Did not recognize directive "${prop}"`);

        const off = source.subscribe(updater);
        if (source.escapes) unsubs.push(off);
        return;
    }
};
// #endregion

// #region wake
// @docs The lifecycle entry point. `wake()` walks the subtree with a
// `TreeWalker`, skipping nested wrappers, templates, and SVG (per `NO_WAKE`).
// Each wired element gets the `_live` attribute so re-entry is idempotent.
// Walking happens once; every tokenized attribute is compiled into a
// subscriber by `wire()`, so runtime updates never re-parse anything.
// `$data-*` attributes on the wrapper itself are computed-value or
// protocol-bound declarations — `wire()` treats them like any other
// `$`-binding; `bind()` routes the sink through `put()` so the cascade
// falls out of the existing pub/sub.
export const wake = (
    root: Element,
    row: Row | null = null,
    wrapper: WrapperNode | null = root.closest('data-wrapper'),
) => {
    if (!wrapper) return;

    const nodes = [root];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n: Node) => NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });

    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Element);

    for (const el of nodes) {
        if (el.hasAttribute(LIVE)) continue;

        const attrs = [...el.attributes].filter(attr => TOKENS.includes(attr.name[0]));
        if (!attrs.length) continue;

        el.setAttribute(LIVE, '');
        for (const attr of attrs) wire(el, attr, row, wrapper);
    }
};
// #endregion
