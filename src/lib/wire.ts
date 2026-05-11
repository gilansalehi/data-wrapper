import { DW_DIRECTIVES, DW_FORMATTERS } from './registry.ts';
import { bind, watch } from './engine.ts';
import type { Row, Sub, Wrapper } from './engine.ts';
import { p, on, emit } from './utils.ts';
import type { pURL } from './utils.ts';

type Format = (value: unknown) => unknown;

export type WrapperNode = Wrapper;

// ---------------------------------------------------------------------------
// DWRL parsing — native new URL() is the entire parser
// ---------------------------------------------------------------------------

const NO_WAKE   = ['DATA-WRAPPER', 'TEMPLATE', 'SVG'];
const LIVE      = '_live';
const TOKENS    = '@$*';

// #region dwrl
const formatter = (url: URL): Format => {
    const pipes = url.searchParams.getAll('format')
        .map(n => DW_FORMATTERS.get(n))
        .filter((f): f is NonNullable<typeof f> => !!f);

    return value => pipes.reduce((v, pipe) => pipe(v), value);
};

const owner = (el: Element): WrapperNode | null => el.closest('data-wrapper')

// subscribe = watch
const subscribe = (wrapper: WrapperNode, row: Row | null, path: string, sub: Sub) => {
    if (row) {
        watch(row.subs, item => sub(item?.[path]), row.item);
    } else {
        wrapper._watch(path, sub);
    }
};

const wireState = (wrapper: WrapperNode, el: Element, token: string, prop: string, purl: pURL, row: Row | null) => {
    const update = token === '$'
        ? bind(el, prop)
        : DW_DIRECTIVES.get(prop)?.({ wrapper, el, key: purl.key, row, wake });

    if (!update) return;

    subscribe(wrapper, purl.isRel ? row : null, purl.path ?? '', value => {
        update(value);
    });
};

// #region wire — wires one tokenized attribute on an element
export const wire = (
    el: Element,
    attr: Attr,
    row: Row | null = null,
    wrapper: WrapperNode | null = owner(el),
) => {
    const { name, value } = attr;
    const token = name[0];
    const prop  = name.slice(1);

    const dwrl = p(value);
    const { path, params } = dwrl;
    if (!path || !wrapper) return; // set default "debugger path"?

    switch (token) {
    case '@': on(prop,
                e => emit(path, { ...params, delegateTarget: el }, el),
                `[${CSS.escape(name)}]`, // delegate selector :(
                wrapper ?? undefined,
            );
            break;
    case '$': subscribe(wrapper, row, path, bind(el, prop)); break;
    case '*': wireState(wrapper, el, token, prop, dwrl, row); break;
    default : return;
    }
};
// #endregion

// #region wake -- wakes node & subtree, wires dynamic attrs
export const wake = (
    root: Element,
    row: Row | null = null,
    wrapper: WrapperNode | null = owner(root),
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
        if (el.hasAttribute(LIVE)) return;

        const attrs = [...el.attributes].filter(attr => TOKENS.includes(attr.name[0]));
        if (!attrs.length) return;

        el.setAttribute(LIVE, '');
        for (const attr of attrs) wire(el, attr, row, wrapper);
    }
};
// #endregion
