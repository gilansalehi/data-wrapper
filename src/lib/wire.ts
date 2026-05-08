import { DW_DIRECTIVES, DW_FORMATTERS } from './registry.ts';
import { bind, watch } from './engine.ts';
import type { Row, Wrapper } from './engine.ts';

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

const wireEvent = (el: Element, name: string) => {
    owner(el)?._routeEvent(name.slice(1));
};

const wireItemBinding = (el: Element, prop: string, path: string, format: Format, row: Row) => {
    const update = bind(el, prop);
    watch(row.subs, item => update(format(item?.[path])), row.item);
};

const wireItemDirective = (el: Element, prop: string, path: string, format: Format, key: string | undefined, row: Row) => {
    const directive = DW_DIRECTIVES.get(prop);
    if (!directive) return;
    const update = directive({
        wrapper: owner(el)!,
        el,
        key,
        wake,
    });
    watch(row.subs, item => update(format(item?.[path])), row.item);
};

const wireBinding = (wrapper: WrapperNode, el: Element, prop: string, path: string, format: Format) => {
    const update = bind(el, prop);
    wrapper._watch(path, value => {
        if (!el.isConnected) return;
        update(format(value));
    });
};

const wireDirective = (wrapper: WrapperNode, el: Element, prop: string, path: string, format: Format, key?: string) => {
    const directive = DW_DIRECTIVES.get(prop);
    if (!directive) return;
    const update = directive({
        wrapper,
        el,
        key,
        wake,
    });

    wrapper._watch(path, value => {
        if (!el.isConnected) return;
        update(format(value));
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
    const token = name[0];
    const prop  = name.slice(1);

    if (token === '@') {
        wireEvent(el, name);
        return;
    }

    if (token !== '$' && token !== '*') return;

    const { path, format, key, url, isItemScoped } = parsePath(attr.value);

    if (url.hostname !== 'x') return; // TODO: cross-wrapper mesh

    if (isItemScoped && row) {
        if (token === '*') {
            wireItemDirective(el, prop, path, format, key, row);
            return;
        }
        wireItemBinding(el, prop, path, format, row);
        return;
    }

    // Wrapper-root binding — requires DOM ancestry.
    const wrapper = owner(el);
    if (!wrapper) return;

    if (token === '*') {
        wireDirective(wrapper, el, prop, path, format, key);
        return;
    }

    wireBinding(wrapper, el, prop, path, format);
};

// ---------------------------------------------------------------------------
// wake — wires one element then walks its subtree
// ---------------------------------------------------------------------------

const _wireElement = (el: Element, row: Row | null) => {
    if (el.hasAttribute(LIVE)) return;
    el.setAttribute(LIVE, '');

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
