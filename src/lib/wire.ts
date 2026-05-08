import { DW_FORMATTERS, resolveDirective } from './registry.ts';
import { applyBinding, watchItem } from './engine.ts';
import type { Effect } from './engine.ts';
import type { Formatter } from './registry.ts';

type WokeNode = Element & { _vWoke?: boolean };

export interface WrapperNode extends HTMLElement {
    state:        Record<string, unknown>;
    _subs:        Record<string, Effect[]>;
    _boundEvents: Set<string>;
    _listCache:   Map<Element, Map<unknown, Element>>;
    _watch(path: string, effect: Effect): void;
    _routeEvent(eventName: string): void;
}

// ---------------------------------------------------------------------------
// DWRL parsing — native new URL() is the entire parser
// ---------------------------------------------------------------------------

const DWRL_BASE = 'dwrl://x/';
const NO_WAKE   = ['DATA-WRAPPER', 'TEMPLATE', 'SVG'];

const parsePath = (attrValue: string) => {
    const isItemScoped   = attrValue.startsWith('./');
    const isCrossWrapper = attrValue.startsWith('//');

    // ./foo → /foo: strip leading dot so URL parser treats it as an absolute path.
    // The isItemScoped flag above captures the original intent.
    const url   = new URL(isItemScoped ? attrValue.slice(1) : attrValue, DWRL_BASE);
    const pipes = url.searchParams.getAll('format')
        .map(n => DW_FORMATTERS.get(n))
        .filter((f): f is Formatter => !!f);

    return {
        pipes,
        isItemScoped,
        isCrossWrapper,
        key:       url.searchParams.get('key') ?? undefined,
        wrapperId: isCrossWrapper ? url.hostname : undefined,
        path:      url.pathname.slice(1), // URL always produces leading /; strip it
    };
};

const format = (value: unknown, pipes: Formatter[]) => {
    for (const pipe of pipes) value = pipe(value);
    return value;
};

const owner = (el: Element) => el.closest('data-wrapper') as WrapperNode | null;

const wireEvent = (el: Element, name: string) => {
    owner(el)?._routeEvent(name.slice(1));
};

const wireItemBinding = (el: Element, prop: string, path: string, pipes: Formatter[], itemNode: Element) => {
    watchItem(itemNode, item => applyBinding(el, prop, format(item?.[path], pipes)));
};

const wireBinding = (wrapper: WrapperNode, el: Element, prop: string, path: string, pipes: Formatter[]) => {
    wrapper._watch(path, value => {
        if (!el.isConnected) return;
        applyBinding(el, prop, format(value, pipes));
    });
};

const wireDirective = (wrapper: WrapperNode, el: Element, prop: string, path: string, pipes: Formatter[], key?: string) => {
    const directive = resolveDirective(prop);
    if (!directive) return;

    wrapper._watch(path, value => {
        if (!el.isConnected) return;
        directive({
            wrapper,
            el,
            value: format(value, pipes),
            key,
            hydrate: (node, item) => wake(node, item),
        });
    });
};

// ---------------------------------------------------------------------------
// wire — wires one tokenized attribute on an element
// ---------------------------------------------------------------------------

export const wire = (
    el: Element,
    attr: Attr,
    itemNode: Element | null = null,
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
    const { path, pipes, key, isItemScoped, isCrossWrapper } = parsePath(attr.value);

    if (isCrossWrapper) return; // TODO: cross-wrapper mesh

    if (isItemScoped && itemNode) {
        if (isDirective) return;
        wireItemBinding(el, prop, path, pipes, itemNode);
        return;
    }

    // Wrapper-root binding — requires DOM ancestry.
    const wrapper = owner(el);
    if (!wrapper) return;

    if (isDirective) {
        wireDirective(wrapper, el, prop, path, pipes, key);
        return;
    }

    wireBinding(wrapper, el, prop, path, pipes);
};

// ---------------------------------------------------------------------------
// wake — wires one element then walks its subtree
// ---------------------------------------------------------------------------

const _wireElement = (el: Element, itemNode: Element | null) => {
    if ((el as WokeNode)._vWoke) return;
    (el as WokeNode)._vWoke = true;

    for (const attr of [...el.attributes]) wire(el, attr, itemNode);
};

export const wake = (root: Element, itemNode: Element | null = null) => {
    _wireElement(root, itemNode);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n: Node) => NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });

    let node: Node | null;
    while ((node = walker.nextNode())) _wireElement(node as Element, itemNode);
};
