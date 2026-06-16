import { p, on, emit, readPath, cloneTemplate, type Off, type pURL } from './utils.ts';

// --- types -------------------------------------------------------------------

export type Sub      = (value: unknown) => void;
export type Subs     = Sub[];
export type Station  = Record<string, Subs>;
export type Item     = Record<string, unknown>;
export type Row      = { node: Element; item: Item; subs: Station; unsubs: Off[] };
export type ListCache = Map<Element, Map<unknown, Row>>;

export type Source = {
    read:      ()        => unknown;
    subscribe: (cb: Sub) => Off;
    escapes:                boolean; // sub lives outside the element's natural scope
};

export type ComponentBindingRuntime = {
    has:            (name: string) => boolean;
    source:         (name: string) => Source;
    activateAction: (name: string) => Off | null;
    destroy:        () => void;
};

export type Wrapper = HTMLElement & {
    state:        Record<string, unknown>;
    _subs:        Station;
    _unsubs:      Off[];
    _listCache:   ListCache;
    _component?:  ComponentBindingRuntime;
};

export type DispatchDetail = {
    originalEvent: Event;
    path:          string;
    isRel:         boolean;
    item?:         Item;
};

export interface DirectiveContext extends pURL {
    wrapper: Wrapper;
    el:      Element;
    row?:    Row | null;
    wake:    (node: Element, row?: Row | null, wrapper?: Wrapper | null) => void;
}
export type DirectiveHandler = (ctx: DirectiveContext) => Sub;
export type Formatter        = (value: unknown, arg?: unknown) => unknown;

// --- station primitives ------------------------------------------------------

export const subscribe = (st: Station, ch: string, sub: Sub, value: unknown): Off => {
    const subs = (st[ch] ??= []);
    subs.push(sub);
    sub(value);
    return () => { const i = subs.indexOf(sub); if (i !== -1) subs.splice(i, 1); };
};

export const publish = (st: Station, ch: string, value: unknown) => {
    for (const sub of [...(st[ch] ?? [])]) sub(value);
};

export const unwire = (offs: Off[]) => { for (const off of offs) off(); offs.length = 0; };

export const unwake = (wrapper: Wrapper) => {
    for (const cache of wrapper._listCache.values())
        for (const row of cache.values()) unwire(row.unsubs);
    unwire(wrapper._unsubs);
};

// --- registries --------------------------------------------------------------

export const DW_DIRECTIVES = new Map<string, DirectiveHandler>();

export const DW_FORMATTERS = new Map<string, Formatter>([
    // `?onoff=truthy:falsy` → one of the two labels. Bare `?onoff` falls back to on/off.
    ['onoff', (v, arg) => {
        if (arg == null || arg === '') return v ? 'on' : 'off';
        const [t, f = ''] = String(arg).split(':');
        return v ? t : f;
    }],
]);

export const PROP_ALIASES: Record<string, string> = {
    text:  'textContent',
    class: 'className',
};

// --- bind --------------------------------------------------------------------

const setProp = (el: Element, prop: string, val: unknown) => {
    if (val == null) return;
    if (prop in el) (el as unknown as Record<string, unknown>)[prop] = val;
    else el.setAttribute(prop, String(val));
};

export const bind = (el: Element, prop: string): Sub => {
    if (prop === 'class') {
        const base = el.className;
        return v => { if (v == null) return;
            setProp(el, 'className', (base + ' ' + String(v)).replace(/\s+/g, ' ').trim());
        };
    }
    const alias = PROP_ALIASES[prop] || prop;
    return v => setProp(el, alias, v);
};

// --- wire / wake -------------------------------------------------------------

const TOKENS    = '@$*';
const NO_WAKE   = ['DATA-WRAPPER', 'SVG'];
const LIVE      = '_live';
const BARE_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:[?#].*)?$/;

const formatter = (params: URLSearchParams) => {
    const steps: ((v: unknown) => unknown)[] = [];
    for (const [k, v] of params) {
        if (k === 'key' || k === 'prevent' || k === 'stop' || k === 'immediate') continue;
        const fn = DW_FORMATTERS.get(k);
        if (fn) steps.push(x => fn(x, v));
    }
    return (value: unknown) => steps.reduce((v, step) => step(v), value);
};

// `./key` on a row reads `row.item[key]` and subscribes to `row.subs[key]`.
const rowSource = (row: Row, path: string): Source => ({
    read:      ()   => readPath(row.item, path),
    subscribe: (cb) => subscribe(row.subs, path, cb, readPath(row.item, path)),
    escapes:        false,
});

export const wire = (
    el:      Element,
    attr:    Attr,
    row:     Row | null = null,
    wrapper: Wrapper | null = el.closest('data-wrapper') as Wrapper | null,
) => {
    if (!wrapper) return;
    const { name, value } = attr;
    const token = name[0];
    const prop  = name.slice(1);
    const dwrl  = p(value);
    const { path, isRel, params } = dwrl;

    const unsubs = row ? row.unsubs : wrapper._unsubs;

    if (token === '@') {
        if (!path) return;
        const off = on(prop, (e: Event) => {
            if (params.has('prevent'))   e.preventDefault();
            if (params.has('stop'))      e.stopPropagation();
            if (params.has('immediate')) e.stopImmediatePropagation();
            const detail: DispatchDetail = { originalEvent: e, path, isRel, item: row?.item };
            emit(path, detail, el);
        }, el);
        unsubs.push(off);

        if (BARE_NAME.test(value)) {
            const actionOff = wrapper._component?.activateAction(path);
            if (actionOff) unsubs.push(actionOff);
        }
        return;
    }

    // PoC: $ and * only resolve bare names (component exports) or `./key` (row item).
    // TODO: pURL branches (`/wrapperState`, `//host/path`) restored in v1.
    const source: Source | null =
        BARE_NAME.test(value) && wrapper._component?.has(path) ? wrapper._component.source(path)
      : row && isRel                                          ? rowSource(row, path)
      :                                                         null;
    if (!source) return;

    if (token === '$') {
        const format = formatter(params);
        const set    = bind(el, prop);
        const off    = source.subscribe(v => set(format(v)));
        if (source.escapes) unsubs.push(off);
        return;
    }

    if (token === '*') {
        const factory = DW_DIRECTIVES.get(prop);
        if (!factory) throw new Error(`Unknown directive *${prop}`);
        const updater = factory({ ...dwrl, wrapper, el, row, wake });
        const off     = source.subscribe(updater);
        if (source.escapes) unsubs.push(off);
        return;
    }
};

export const wake = (
    root:    Element,
    row:     Row | null = null,
    wrapper: Wrapper | null = root.closest('data-wrapper') as Wrapper | null,
) => {
    if (!wrapper) return;
    const nodes: Element[] = [root];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Element);

    for (const el of nodes) {
        if (el.hasAttribute(LIVE)) continue;
        const attrs = [...el.attributes].filter(a => TOKENS.includes(a.name[0]));
        if (!attrs.length) continue;
        el.setAttribute(LIVE, '');
        for (const a of attrs) wire(el, a, row, wrapper);
    }
};

// --- *list + *if (directives on <template>) ----------------------------------

// reconcile diffs `data` against `cache` by identity (default key: `id`).
// Existing rows update in place via row.subs publish; new rows clone the
// template body and wake; missing rows tear down and detach.
const reconcile = (
    container: Element,
    data:      Item[],
    cache:     Map<unknown, Row>,
    tpl:       HTMLTemplateElement,
    keyProp:   string,
) => {
    const active = new Set<unknown>();
    const frag   = document.createDocumentFragment();
    const fresh: Row[] = [];

    for (const item of data) {
        const id = item[keyProp] ?? JSON.stringify(item);
        active.add(id);

        let row = cache.get(id);
        if (!row) {
            const node = cloneTemplate(tpl)!;
            node.setAttribute('_key', String(id));
            row = { node, item, subs: {}, unsubs: [] };
            cache.set(id, row);
            fresh.push(row);
        } else {
            row.item = item;
            for (const ch in row.subs) publish(row.subs, ch, readPath(item, ch));
        }
        frag.appendChild(row.node);
    }

    for (const [id, row] of cache) {
        if (active.has(id)) continue;
        unwire(row.unsubs);
        row.node.remove();
        cache.delete(id);
    }

    container.appendChild(frag);
    for (const row of fresh) wake(row.node, row);
};

// `*list` lives on the <template>. The template's body is the row; the
// template's parent is the container. The template itself never renders.
const listDirective: DirectiveHandler = ({ wrapper, el, params }) => {
    const tpl       = el as HTMLTemplateElement;
    const container = tpl.parentElement;
    if (!container) return () => {};

    let cache = wrapper._listCache.get(container);
    if (!cache) { cache = new Map(); wrapper._listCache.set(container, cache); }

    const keyProp = params.get('key') || 'id';

    return value => {
        const items = Array.isArray(value) ? value : [];
        if (items.length === 0) {
            for (const row of cache.values()) { unwire(row.unsubs); row.node.remove(); }
            cache.clear();
            return;
        }
        reconcile(container, items, cache, tpl, keyProp);
    };
};

// `*if` also lives on the <template>. Truthy → clone the body in place; falsy →
// remove it. An anchor comment marks the slot so re-show appends at the same point.
const ifDirective: DirectiveHandler = ({ wrapper, el, row }) => {
    const tpl    = el as HTMLTemplateElement;
    const anchor = document.createComment('dw-if');
    tpl.replaceWith(anchor);

    let live: Element | null = null;
    return value => {
        if (value && !live) {
            live = cloneTemplate(tpl);
            if (!live) return;
            anchor.parentNode!.insertBefore(live, anchor);
            wake(live, row ?? null, wrapper);
        } else if (!value && live) {
            unwireSubtreeIfRow(live, row);
            live.remove();
            live = null;
        }
    };
};

// When *if is inside a *list row, the cloned subtree's bindings live on
// row.unsubs — we only need to tear those down if the row outlives the if.
// Row teardown clears row.unsubs itself, so this is a no-op stub for PoC.
// TODO: track per-clone unsubs once we support escaping subs from *if clones.
const unwireSubtreeIfRow = (_clone: Element, _row: Row | null | undefined) => {};

DW_DIRECTIVES.set('list', listDirective);
DW_DIRECTIVES.set('if',   ifDirective);
