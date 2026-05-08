import { CONFIG, DW_FORMATTERS, resolveDirective } from './registry.ts';
import { applyBinding, reconcile } from './engine.ts';
import type { Effect } from './engine.ts';
import type { Formatter } from './registry.ts';

type ItemNode = Element & { _vItem?: Record<string, unknown>; _vItemEffects?: Effect<Record<string, unknown>>[] };
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

// ---------------------------------------------------------------------------
// wire — wires one tokenized attribute on an element
// ---------------------------------------------------------------------------

export const wire = (
    el: Element,
    attr: Attr,
    itemNode: Element | null = null,
    owner: WrapperNode | null = null,
) => {
    const { BIND, DIR, EVT } = CONFIG.TOKENS;
    const { name } = attr;

    if (name.startsWith(EVT)) {
        const wrapper = owner ?? (el.closest('data-wrapper') as WrapperNode | null);
        if (wrapper) wrapper._routeEvent(name.slice(EVT.length));
        return;
    }

    const isBinding   = name.startsWith(BIND);
    const isDirective = name.startsWith(DIR);
    if (!isBinding && !isDirective) return;

    const prefix = isDirective ? DIR : BIND;
    const prop   = name.slice(prefix.length);
    const { path, pipes, key, isItemScoped, isCrossWrapper } = parsePath(attr.value);

    if (isCrossWrapper) return; // TODO: cross-wrapper mesh

    if (isItemScoped && itemNode) {
        if (isDirective) return;
        const effect: Effect<Record<string, unknown>> = item => applyBinding(el, prop, format(item?.[path], pipes));
        ((itemNode as ItemNode)._vItemEffects ??= []).push(effect);
        effect((itemNode as ItemNode)._vItem || {});
        return;
    }

    // Wrapper-root binding — requires DOM ancestry.
    const wrapper = owner ?? (el.closest('data-wrapper') as WrapperNode | null);
    if (!wrapper) return;

    if (isDirective) {
        const directive = resolveDirective(prop);
        if (!directive) return;
        wrapper._watch(path, value => {
            if (!el.isConnected) return;
            directive({
                wrapper,
                el,
                value: format(value, pipes),
                key,
                renderList: (container, data, cache, tpl, itemKey) => reconcile(
                    container,
                    data,
                    cache,
                    tpl,
                    (node, item) => wake(node, item, wrapper),
                    itemKey,
                ),
            });
        });
        return;
    }

    wrapper._watch(path, value => {
        if (!el.isConnected) return;
        applyBinding(el, prop, format(value, pipes));
    });
};

// ---------------------------------------------------------------------------
// wake — wires one element then walks its subtree
// ---------------------------------------------------------------------------

const _wireElement = (el: Element, itemNode: Element | null, owner: WrapperNode | null) => {
    if ((el as WokeNode)._vWoke) return;
    (el as WokeNode)._vWoke = true;

    for (const attr of [...el.attributes]) wire(el, attr, itemNode, owner);
};

export const wake = (root: Element, itemNode: Element | null = null, owner: WrapperNode | null = null) => {
    _wireElement(root, itemNode, owner);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n: Node) => CONFIG.NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });

    let node: Node | null;
    while ((node = walker.nextNode())) _wireElement(node as Element, itemNode, owner);
};
