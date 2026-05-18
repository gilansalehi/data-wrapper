import { cloneTemplate, DW_DIRECTIVES, DW_FORMATTERS, PROP_ALIASES, resolveTemplate } from './registry.ts';
import type { DirectiveHandler, DispatchDetail, DispatchPayload, Item, Row, Station, Sub, Subs, Wrapper } from './registry.ts';
import { p, on, emit, readPath, type Off } from './utils.ts';

export type { Item, ListCache, Row, Station, Sub, Subs, Wrapper } from './registry.ts';

const set = (el: Element, prop: string, val: unknown) => {
    if (val === undefined || val === null) return;
    if (prop in el) {
        (el as unknown as Record<string, unknown>)[prop] = val;
    } else {
        el.setAttribute(prop, String(val));
    }
};

export const bind = (el: Element, prop: string): Sub => {
    if (prop === 'class') {
        const base = el.className;
        return val => {
            if (val === undefined || val === null) return;
            set(el, 'className', (base + ' ' + String(val)).replace(/\s+/g, ' ').trim());
        };
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
    wake: (node: Element, row: Row | null) => void,
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
    const wakeOwned = (node: Element, row: Row | null = null) => wake(node, row, wrapper);
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
        wakeOwned(emptyNode);
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
        reconcile(el, items, cache, tpl, wakeOwned, identityKey);
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

// #region dwrl
// @docs DWRL drives the framework's wire surface — `pURL()` in `utils.ts`
// does the parsing; these helpers consume the result. `formatter()` compiles
// a `?format=name` chain into a single closure at wake time, so runtime
// updates never look up formatters again. `collectPayload()` packs the data
// `@`-events ride with: a full FormData dump from `<form>`, or `{name: value}`
// from anything else with a `name` attribute.
const formatter = (params: URLSearchParams): Format => {
    const pipes = params.getAll('format')
        .map(n => DW_FORMATTERS.get(n))
        .filter((f): f is NonNullable<typeof f> => !!f);

    return value => pipes.reduce((v, pipe) => pipe(v), value);
};

const collectPayload = (el: Element): DispatchPayload => {
    if (el instanceof HTMLFormElement) {
        const out: DispatchPayload = {};
        for (const [k, v] of new FormData(el)) {
            const existing = out[k];
            if (existing === undefined)       out[k] = v;
            else if (Array.isArray(existing)) existing.push(v);
            else                              out[k] = [existing, v];
        }
        return out;
    }
    const ni = el as HTMLInputElement;
    return ni.name ? { [ni.name]: ni.value } : {};
};
// #endregion

// #region wire
// @docs The token dispatch. `wire()` runs once per tokenized attribute and
// turns it into a subscriber. `$prop` binds state to a DOM property,
// `*directive` invokes a registered structural directive, `@event` delegates
// a native DOM event to an emitted topic. A `//host/path` DWRL points `$`/`*`
// at a wrapper named by id rather than the local one. A subscription that
// escapes the element's own scope — a `/absolute` path inside a `*list` row,
// a `//host/` path, or any `@` listener — has its `Off` recorded on the
// scope's `unsubs` so eviction can tear it down. Three tokens, one function,
// no runtime parsing past wake.

// Resolve a DWRL host to its wrapper. The default sentinel keeps the local
// wrapper; a named host is looked up by id and must already be upgraded.
const resolveHost = (host: string, local: WrapperNode): WrapperNode | null => {
    if (host === HOST_SELF) return local;
    const found = document.getElementById(host);
    if (found && '_subs' in found) return found as WrapperNode;
    console.warn(`<data-wrapper>: host "${host}" not found or not yet upgraded`);
    return null;
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
    const { path, params, host } = dwrl;
    if (!path || !wrapper) return; // set default "debugger path"?

    // Teardown handles live on the element's scope: its *list row, else the wrapper.
    const unsubs = row ? row.unsubs : wrapper._unsubs;

    if (token === '@') {
        // The delegated listener lands on the wrapper — it outlives the
        // declaring element's scope, so its Off is always kept for teardown.
        const off = on(prop, (e) => {
            if (params.has('prevent'))   e.preventDefault();
            if (params.has('stop'))      e.stopPropagation();
            if (params.has('immediate')) e.stopImmediatePropagation();

            const detail: DispatchDetail = {
                originalEvent: e,
                payload: collectPayload(el),
            };
            emit(path, detail, el);
        }, el, wrapper);

        unsubs.push(off);
        return;
    }

    // `$`/`*` read from the host wrapper — the local one, unless a `//host/`
    // DWRL names another wrapper by id.
    const target = resolveHost(host, wrapper);
    if (!target) return;

    const scoped  = row && dwrl.isRel;
    const station = scoped ? row.subs                 : target._subs;
    const initial = scoped ? readPath(row.item, path) : readPath(target.state, path);

    // A binding escapes its scope when it subscribes somewhere other than that
    // scope's own Station — a `/absolute` path inside a row, or a `//host/`
    // path into another wrapper. Escapes are tracked for teardown; in-scope
    // subs are not.
    const escapes = station !== (row ? row.subs : wrapper._subs);

    if (token === '$') {
        const format = formatter(params);
        const set    = bind(el, prop);

        const off = subscribe(station, path, v => set(format(v)), initial);
        if (escapes) unsubs.push(off);
        return;
    }

    if (token === '*') {
        const updater = DW_DIRECTIVES.get(prop)?.({ ...dwrl, wrapper, el, row, wake });
        if (!updater) throw new Error(`Did not recognize directive "${prop}"`);

        const off = subscribe(station, path, updater, initial);
        if (escapes) unsubs.push(off);
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
