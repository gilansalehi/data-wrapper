import { p, on, emit, readPath, cloneTemplate, type Off, type pURL } from './utils.ts';

// --- types -------------------------------------------------------------------

export type Sub      = (value: unknown) => void;
export type Subs     = Sub[];
export type Station  = Record<string, Subs>;
export type Item     = Record<string, unknown>;
export type Row      = { node: Element; item: Item; subs: Station; unsubs: Off[] };
export type ListCache = Map<Element, Map<unknown, Row>>;

export type BindingContext = {
    wrapper: Wrapper;
    scope:   SourceScope | null;
    parent:  BindingContext | null;
    unsubs:  Off[];
};

export type Source = {
    read:      ()        => unknown;
    subscribe: (cb: Sub) => Off;
};

export type SourceScope = {
    source: (path: string) => Source | null;
    item?:  () => Item | undefined;
};

export type ComponentBindingRuntime = SourceScope & {
    has:            (name: string) => boolean;
    activateAction: (name: string) => Off | null;
    destroy:        () => void;
};

export type Wrapper = HTMLElement & {
    _unsubs:     Off[];
    _listCache:  ListCache;
    _component?: ComponentBindingRuntime;
    _loadedSrc?: string;
};

export type DispatchDetail = {
    originalEvent: Event;
    path:          string;
    isRel:         boolean;
    item?:         Item;
};

export interface DirectiveContext extends pURL {
    ctx:  BindingContext;
    el:   Element;
    wake: (node: Element, ctx: BindingContext) => void;
}
export type DirectiveHandler = (ctx: DirectiveContext) => Sub;
export type Formatter        = (value: unknown, arg?: unknown) => unknown;

export const rootContext = (wrapper: Wrapper): BindingContext =>
    ({ wrapper, scope: wrapper._component ?? null, parent: null, unsubs: wrapper._unsubs });

export const childContext = (parent: BindingContext, row: Row): BindingContext =>
    ({ wrapper: parent.wrapper, scope: rowScope(row), parent, unsubs: row.unsubs });

const blockContext = (parent: BindingContext, unsubs: Off[]): BindingContext =>
    ({ wrapper: parent.wrapper, scope: null, parent, unsubs });

const nearestItemScope = (ctx: BindingContext): SourceScope | null => {
    for (let c: BindingContext | null = ctx; c; c = c.parent)
        if (c.scope?.item) return c.scope;
    return null;
};

export const nearestItem = (ctx: BindingContext): Item | undefined =>
    nearestItemScope(ctx)?.item?.();

export const ownerUnsubs = (ctx: BindingContext): Off[] =>
    ctx.unsubs;

export const own = (ctx: BindingContext, off: Off) => {
    ownerUnsubs(ctx).push(off);
};

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
const BARE_PATH = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:\/[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;
const BARE_BINDING = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:\/[a-zA-Z_$][a-zA-Z0-9_$]*)*(?:[?#].*)?$/;
type BindingResolution = { source: Source | null; missed: boolean };

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
});

const firstPathSegment = (path: string): string =>
    path.split('/')[0] ?? '';

const hasOwn = (obj: object, key: PropertyKey) =>
    Object.prototype.hasOwnProperty.call(obj, key);

const rowScope = (row: Row): SourceScope => ({
    source: path => hasOwn(row.item, firstPathSegment(path)) ? rowSource(row, path) : null,
    item:   () => row.item,
});

export const resolveSource = (
    ctx:   BindingContext,
    path:  string,
    isRel: boolean,
    raw?:  string,
): Source | null => {
    if (!BARE_PATH.test(path)) return null;
    if (isRel) return nearestItemScope(ctx)?.source(path) ?? null;
    if (raw !== undefined && !BARE_BINDING.test(raw)) return null;

    for (let c: BindingContext | null = ctx; c; c = c.parent) {
        const source = c.scope?.source(path);
        if (source) return source;
    }
    return null;
};

const staticSource = (value: unknown): Source => ({
    read:      () => value,
    subscribe: cb => { cb(value); return () => {}; },
});

const isReservedBinding = (raw: string): boolean =>
    raw.startsWith('../') || raw.startsWith('/');

const canFallbackToStatic = (raw: string, path: string): boolean =>
    BARE_BINDING.test(raw) || (raw.startsWith('./') && BARE_PATH.test(path));

const resolveBinding = (
    ctx:   BindingContext,
    path:  string,
    isRel: boolean,
    raw:   string,
): BindingResolution => {
    if (isReservedBinding(raw)) return { source: null, missed: false };

    const source = resolveSource(ctx, path, isRel, raw);
    if (source) return { source, missed: false };

    if (!canFallbackToStatic(raw, path)) return { source: null, missed: false };
    return { source: staticSource(path), missed: true };
};

const warnStaticFallback = (value: string) => {
    console.warn(`data-wrapper: unresolved binding "${value}" rendered as a static literal`);
};

export const wire = (
    el:   Element,
    attr: Attr,
    ctx:  BindingContext,
) => {
    const { name, value } = attr;
    const token = name[0];
    const prop  = name.slice(1);
    const dwrl  = p(value);
    const { path, isRel, params } = dwrl;
    const wrapper = ctx.wrapper;

    if (token === '@') {
        if (!path) return;
        const off = on(prop, (e: Event) => {
            if (params.has('prevent'))   e.preventDefault();
            if (params.has('stop'))      e.stopPropagation();
            if (params.has('immediate')) e.stopImmediatePropagation();
            const detail: DispatchDetail = { originalEvent: e, path, isRel, item: nearestItem(ctx) };
            emit(path, detail, el);
        }, el);
        own(ctx, off);

        if (BARE_BINDING.test(value)) {
            const actionOff = wrapper._component?.activateAction(path);
            if (actionOff) own(ctx, actionOff);
        }
        return;
    }

    // PoC: $ and * resolve bare names local-first or `./key` from the nearest row.
    // TODO: pURL branches (`/wrapperState`, `//host/path`) restored in v1.
    const { source, missed } = resolveBinding(ctx, path, isRel, value);
    if (!source) return;
    if (missed) warnStaticFallback(value);

    if (token === '$') {
        const format = formatter(params);
        const set    = bind(el, prop);
        const off    = source.subscribe(v => set(format(v)));
        own(ctx, off);
        return;
    }

    if (token === '*') {
        const factory = DW_DIRECTIVES.get(prop);
        if (!factory) throw new Error(`Unknown directive *${prop}`);
        const updater = factory({ ...dwrl, ctx, el, wake });
        const off     = source.subscribe(updater);
        own(ctx, off);
        return;
    }
};

export const wake = (
    root: Element,
    ctx:  BindingContext,
) => {
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
        for (const a of attrs) wire(el, a, ctx);
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
    ctx:       BindingContext,
) => {
    const active = new Set<unknown>();
    const fresh: Row[] = [];
    let cursor: ChildNode | null = tpl.nextSibling;

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
        if (row.node !== cursor && row.node.nextSibling !== cursor)
            container.insertBefore(row.node, cursor);
        cursor = row.node.nextSibling;
    }

    for (const [id, row] of cache) {
        if (active.has(id)) continue;
        unwire(row.unsubs);
        row.node.remove();
        cache.delete(id);
    }

    for (const row of fresh) wake(row.node, childContext(ctx, row));
};

// `*list` lives on the <template>. The template's body is the row; the
// template's parent is the container. The template itself never renders.
const listDirective: DirectiveHandler = ({ ctx, el, params }) => {
    const tpl       = el as HTMLTemplateElement;
    const container = tpl.parentElement;
    if (!container) return () => {};

    const wrapper = ctx.wrapper;
    let cache = wrapper._listCache.get(container);
    if (!cache) { cache = new Map(); wrapper._listCache.set(container, cache); }

    own(ctx, () => {
        for (const row of cache.values()) { unwire(row.unsubs); row.node.remove(); }
        cache.clear();
        wrapper._listCache.delete(container);
    });

    const keyProp = params.get('key') || 'id';

    return value => {
        const items = Array.isArray(value) ? value : [];
        if (items.length === 0) {
            for (const row of cache.values()) { unwire(row.unsubs); row.node.remove(); }
            cache.clear();
            return;
        }
        reconcile(container, items, cache, tpl, keyProp, ctx);
    };
};

// `*if` also lives on the <template>. Truthy → clone the body in place; falsy →
// remove it. An anchor comment marks the slot so re-show appends at the same point.
const ifDirective: DirectiveHandler = ({ ctx, el }) => {
    const tpl    = el as HTMLTemplateElement;
    const anchor = document.createComment('dw-if');
    tpl.replaceWith(anchor);

    let live: Element | null = null;
    let liveUnsubs: Off[] = [];

    const disposeLive = () => {
        unwire(liveUnsubs);
        live?.remove();
        live = null;
        liveUnsubs = [];
    };
    own(ctx, disposeLive);

    return value => {
        if (value && !live) {
            live = cloneTemplate(tpl);
            if (!live) return;
            liveUnsubs = [];
            anchor.parentNode!.insertBefore(live, anchor);
            wake(live, blockContext(ctx, liveUnsubs));
        } else if (!value && live) {
            disposeLive();
        }
    };
};

DW_DIRECTIVES.set('list', listDirective);
DW_DIRECTIVES.set('if',   ifDirective);
