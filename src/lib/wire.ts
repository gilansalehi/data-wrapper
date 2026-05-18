import { DW_DIRECTIVES, DW_FORMATTERS } from './registry.ts';
import type { DispatchDetail, DispatchPayload } from './registry.ts';
import { bind, subscribe } from './engine.ts';
import type { Row, Wrapper } from './engine.ts';
import { p, on, emit, readPath } from './utils.ts';

type Format = (value: unknown) => unknown;

export type WrapperNode = Wrapper;

// ---------------------------------------------------------------------------
// DWRL parsing — native new URL() is the entire parser
// ---------------------------------------------------------------------------

const NO_WAKE   = ['DATA-WRAPPER', 'TEMPLATE', 'SVG'];
const LIVE      = '_live';
const TOKENS    = '@$*';

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
// a native DOM event to an emitted topic. Three tokens, one function, no
// runtime parsing past wake.
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
    const { path, params } = dwrl;
    if (!path || !wrapper) return; // set default "debugger path"?

    if (token === '@') {
        on(prop, (e) => {
            if (params.has('prevent'))   e.preventDefault();
            if (params.has('stop'))      e.stopPropagation();
            if (params.has('immediate')) e.stopImmediatePropagation();

            const detail: DispatchDetail = {
                originalEvent: e,
                payload: collectPayload(el),
            };
            emit(path, detail, el);
        }, el, wrapper);
        return;
    }

    const scoped  = row && dwrl.isRel;
    const station = scoped ? row.subs                 : wrapper._subs;
    const initial = scoped ? readPath(row.item, path) : readPath(wrapper.state, path);

    if (token === '$') {
        const format = formatter(params);
        const set    = bind(el, prop);

        subscribe(station, path, v => set(format(v)), initial);
        return;
    }

    if (token === '*') {
        const updater = DW_DIRECTIVES.get(prop)?.({ ...dwrl, wrapper, el, row, wake });
        if (!updater) throw new Error(`Did not recognize directive "${prop}"`);

        subscribe(station, path, updater, initial);
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
