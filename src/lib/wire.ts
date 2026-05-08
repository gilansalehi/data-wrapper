import { DW_FORMATTERS, resolveDirective } from './registry.ts';
import { bind, watchRow } from './engine.ts';
import type { Effect, ListCache, Row } from './engine.ts';

type WokeNode = Element & { _vWoke?: boolean };
type Format = (value: unknown) => unknown;

export interface WrapperNode extends HTMLElement {
    state:        Record<string, unknown>;
    _subs:        Record<string, Effect[]>;
    _boundEvents: Set<string>;
    _listCache:   ListCache;
    _watch(path: string, effect: Effect): void;
    _routeEvent(eventName: string): void;
}

// ---------------------------------------------------------------------------
// DWRL parsing — native new URL() is the entire parser
// ---------------------------------------------------------------------------

const DWRL_BASE = 'dwrl://x/';
const NO_WAKE   = ['DATA-WRAPPER', 'TEMPLATE', 'SVG'];

const formatter = (url: URL): Format => {
    const pipes = url.searchParams.getAll('format')
        .map(n => DW_FORMATTERS.get(n))
        .filter((f): f is NonNullable<typeof f> => !!f);

    return value => pipes.reduce((v, pipe) => pipe(v), value);
};

const parsePath = (attrValue: string) => {
    const isItemScoped = attrValue.startsWith('./');

    // ./foo → /foo: strip leading dot so URL parser treats it as an absolute path.
    // The isItemScoped flag above captures the original intent.
    const url = new URL(isItemScoped ? attrValue.slice(1) : attrValue, DWRL_BASE);

    return {
        url,
        format: formatter(url),
        isItemScoped,
        key:       url.searchParams.get('key') ?? undefined,
        path:      url.pathname.slice(1), // URL always produces leading /; strip it
    };
};

const owner = (el: Element) => el.closest('data-wrapper') as WrapperNode | null;

const wireEvent = (el: Element, name: string) => {
    owner(el)?._routeEvent(name.slice(1));
};

const wireItemBinding = (el: Element, prop: string, path: string, format: Format, row: Row) => {
    const update = bind(el, prop);
    watchRow(row, item => update(format(item?.[path])));
};

const wireBinding = (wrapper: WrapperNode, el: Element, prop: string, path: string, format: Format) => {
    const update = bind(el, prop);
    wrapper._watch(path, value => {
        if (!el.isConnected) return;
        update(format(value));
    });
};

const wireDirective = (wrapper: WrapperNode, el: Element, prop: string, path: string, format: Format, key?: string) => {
    const directive = resolveDirective(prop);
    if (!directive) return;

    wrapper._watch(path, value => {
        if (!el.isConnected) return;
        directive({
            wrapper,
            el,
            value: format(value),
            key,
            hydrate: (node, row) => wake(node, row),
        });
    });
};

// ---------------------------------------------------------------------------
// wire — wires one tokenized attribute on an element
// ---------------------------------------------------------------------------

export const wire = (
    el: Element,
    attr: Attr,
    row: Row | null = null,
) => {
    const { name } = attr;

    if (name.startsWith('@')) {
        wireEvent(el, name);
        return;
    }

    const isBinding   = name.startsWith('$');
    const isDirective = name.startsWith('*');
    if (!isBinding && !isDirective) return;

    const prop = name.slice(1);
    const { path, format, key, url, isItemScoped } = parsePath(attr.value);

    if (url.hostname !== 'x') return; // TODO: cross-wrapper mesh

    if (isItemScoped && row) {
        if (isDirective) return;
        wireItemBinding(el, prop, path, format, row);
        return;
    }

    // Wrapper-root binding — requires DOM ancestry.
    const wrapper = owner(el);
    if (!wrapper) return;

    if (isDirective) {
        wireDirective(wrapper, el, prop, path, format, key);
        return;
    }

    wireBinding(wrapper, el, prop, path, format);
};

// ---------------------------------------------------------------------------
// wake — wires one element then walks its subtree
// ---------------------------------------------------------------------------

const _wireElement = (el: Element, row: Row | null) => {
    if ((el as WokeNode)._vWoke) return;
    (el as WokeNode)._vWoke = true;

    for (const attr of [...el.attributes]) wire(el, attr, row);
};

export const wake = (root: Element, row: Row | null = null) => {
    _wireElement(root, row);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n: Node) => NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });

    let node: Node | null;
    while ((node = walker.nextNode())) _wireElement(node as Element, row);
};
