import type { pURL } from './utils.ts';

export type Sub = (value: unknown) => void;
export type Subs = Sub[];
export type Station = Record<string, Subs>;
export type Formatter = (v: unknown) => unknown;
export type Item = Record<string, unknown>;
export type Row = { node: Element; item: Item; subs: Station };
export type ListCache = Map<Element, Map<unknown, Row>>;

// #region event-dispatch
// @docs One delegated listener per `@event` token, attached to the wrapper.
// Native browser bubbling carries the event up; the listener filters out
// events owned by nested wrappers, then emits the topic named on the
// declaring element along with a `DispatchDetail`. Adding handlers to
// dynamically-inserted DOM costs nothing — the listener is already installed.
export type DispatchPayload = Record<string, FormDataEntryValue | FormDataEntryValue[]>;
export type DispatchDetail  = {
    originalEvent: Event;
    payload:       DispatchPayload;
};
export type DispatchEvent = CustomEvent<DispatchDetail>;
// #endregion
// #region wrapper-contract
// @docs The shape every `<data-wrapper>` presents to the rest of the
// framework. `state` reads and writes through a Proxy over `data-*`
// attributes; `_subs` is the wrapper's Station (one channel per path);
// `_listCache` holds row caches per `*list` element. Everything else lives
// in methods on the class.
export type Wrapper = HTMLElement & {
    state:        Record<string, unknown>;
    _subs:        Station;
    _listCache:   ListCache;
};
// #endregion

const tmpl = (html: string) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    return tpl;
};

export const DW_TEMPLATES = [...document.querySelectorAll('template')].reduce((acc, item) => {
    return acc.set(item.id, item as HTMLTemplateElement);
}, new Map<string, HTMLTemplateElement>([
    // #region templates
    // @docs Built-in templates referenced by `data-empty="name"` on a `*list`
    // element. Override by declaring a `<template id>` with the same name
    // anywhere in your document — `resolveTemplate()` prefers user-declared
    // templates over built-ins.
    ['dw-empty',   tmpl('<li data-dw-template="empty">No items</li>')],
    ['dw-missing', tmpl('<span data-dw-template="missing">—</span>')],
    ['dw-loading', tmpl('<span data-dw-template="loading">Loading...</span>')],
    ['dw-error',   tmpl('<span data-dw-template="error">Something went wrong</span>')],
    // #endregion
]));

export const resolveTemplate = (name: string): HTMLTemplateElement => {
    const declared = document.getElementById(name);
    if (declared?.tagName === 'TEMPLATE') return declared as HTMLTemplateElement;

    return DW_TEMPLATES.get(name) ?? DW_TEMPLATES.get('dw-missing') as HTMLTemplateElement;
};

export const cloneTemplate = (tpl: HTMLTemplateElement) =>
    (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild as Element | null;

export const DW_FORMATTERS = new Map<string, Formatter>([
    // #region formatters
    // @docs Append `?format=name` to any path to pipe its value through a
    // transformer. Chain multiple — applied left to right. The snippet below
    // is the built-in set; add your own with `DW_FORMATTERS.set(name, fn)`.
    ['count',    v => (Array.isArray(v) || typeof v === 'string') ? v.length : 0],
    ['fallback', v => v ?? '—'],
    ['json',     v => JSON.stringify(v, null, 2)],
    ['upper',    v => String(v || '').toUpperCase()],
    ['lower',    v => String(v || '').toLowerCase()],
    ['currency', v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0)],
    ['date',     v => v ? new Date(v as string).toLocaleDateString() : ''],
    ['trim',     v => String(v || '').trim()],
    ['bool',     v => !!v],
    ['onoff',    v => v ? 'on' : 'off'],
    ['yesno',    v => v ? 'yes' : 'no'],
    // #endregion
]);

export const PROP_ALIASES: Record<string, string> = {
    // #region prop-aliases
    // @docs `$prop="/path"` sets `el[prop] = value` on update. Most names map
    // directly — these are the exceptions, the HTML-attribute to DOM-property
    // naming gap (`class` → `className`, `for` → `htmlFor`, etc.). `$class` is
    // special-cased in `bind()`: it preserves the element's static base classes
    // and merges the dynamic value on top.
    text:            'textContent',
    html:            'innerHTML',
    class:           'className',
    for:             'htmlFor',
    readonly:        'readOnly',
    tabindex:        'tabIndex',
    maxlength:       'maxLength',
    minlength:       'minLength',
    contenteditable: 'contentEditable',
    crossorigin:     'crossOrigin',
    // #endregion
};

// The context a directive factory receives. It carries the element the
// directive governs and that element's wrapper, the optional `*list` row it
// belongs to, and the `wake` callback for re-animating remounted subtrees.
// It also extends `pURL`, so the parsed instruction's fields — `path`, `key`,
// `params`, … — sit directly on the context: a directive reads `path` with no
// indirection, and one that later needs `params` or `hash` reads another
// field instead of forcing an edit here and in `wire()`.
export interface DirectiveContext extends pURL {
    wrapper: Wrapper;
    el:      Element;
    row?:    Row | null;
    wake:    (node: Element, row?: Row | null, wrapper?: Wrapper | null) => void;
}

export type DirectiveHandler = (ctx: DirectiveContext) => Sub;

export const DW_DIRECTIVES = new Map<string, DirectiveHandler>();
