import { DW_DIRECTIVES, DW_FORMATTERS } from './registry.ts';
import { bind, watch } from './engine.ts';
import type { Row, Sub, Wrapper } from './engine.ts';

type Format = (value: unknown) => unknown;

export type WrapperNode = Wrapper;

// ---------------------------------------------------------------------------
// DWRL parsing — native new URL() is the entire parser
// ---------------------------------------------------------------------------

const DWRL_BASE = 'dwrl://x/';
const NO_WAKE   = ['DATA-WRAPPER', 'TEMPLATE', 'SVG'];
const LIVE      = '_live';

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

const wireEvent = (wrapper: WrapperNode | null, name: string) => {
    wrapper?._routeEvent(name.slice(1));
};

const subscribe = (wrapper: WrapperNode, row: Row | null, path: string, sub: Sub) => {
    if (row) {
        watch(row.subs, item => sub(item?.[path]), row.item);
    } else {
        wrapper._watch(path, sub);
    }
};

const wireState = (wrapper: WrapperNode, el: Element, token: string, prop: string, p: ReturnType<typeof parsePath>, row: Row | null) => {
    const update = token === '$'
        ? bind(el, prop)
        : DW_DIRECTIVES.get(prop)?.({ wrapper, el, key: p.key, row, wake });

    if (!update) return;

    subscribe(wrapper, p.isItemScoped ? row : null, p.path, value => {
        update(p.format(value));
    });
};

// ---------------------------------------------------------------------------
// wire — wires one tokenized attribute on an element
// ---------------------------------------------------------------------------

export const wire = (
    el: Element,
    attr: Attr,
    row: Row | null = null,
    wrapper: WrapperNode | null = owner(el),
) => {
    const { name } = attr;
    const token = name[0];
    const prop  = name.slice(1);

    if (token === '@') {
        wireEvent(wrapper, name);
        return;
    }

    if (token !== '$' && token !== '*') return;

    const p = parsePath(attr.value);

    if (p.url.hostname !== 'x') return; // TODO: cross-wrapper mesh

    if (!wrapper) return;

    wireState(wrapper, el, token, prop, p, row);
};

// ---------------------------------------------------------------------------
// wake — wires one element then walks its subtree
// ---------------------------------------------------------------------------

const _wireElement = (el: Element, row: Row | null, wrapper: WrapperNode | null) => {
    if (el.hasAttribute(LIVE)) return;
    if (!wrapper) return;

    el.setAttribute(LIVE, '');
    for (const attr of [...el.attributes]) wire(el, attr, row, wrapper);
};

export const wake = (
    root: Element,
    row: Row | null = null,
    wrapper: WrapperNode | null = owner(root),
) => {
    const nodes = [root];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n: Node) => NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });

    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Element);
    for (const el of nodes) _wireElement(el, row, wrapper);
};
