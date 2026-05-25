import { readPath, type pURL, type Off } from './utils.ts';

export type Sub = (value: unknown) => void;
export type Subs = Sub[];
export type Station = Record<string, Subs>;
// Formatter is the unit of the pURL pipeline. It receives the current
// pipeline value plus its argument — either the raw param value from
// the URL, or the *resolved* value when the param was pURL-shaped
// (e.g. `?where=/filter` arrives at `where` as the value of `/filter`,
// not the literal string `/filter`). Old single-value formatters still
// satisfy this shape — extra params passed to a unary function are
// ignored.
export type Formatter = (value: unknown, arg?: unknown) => unknown;
export type Item = Record<string, unknown>;
export type Row = { node: Element; item: Item; subs: Station; unsubs: Off[] };
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
// `_listCache` holds row caches per `*list` element; `_unsubs` collects the
// `Off` handles for subscriptions that escape the wrapper's own scope, so
// `load()` can tear them down. `put()` is the framework's path-aware
// writer — `bind()`'s wrapper-data-* branch routes `$data-*` sinks
// through it so the computed-value cascade rides the same primitive
// every other binding uses. `_isSyncing` gates self-publish during a
// put-driven drain and during the same put's MutationObserver echo.
export type Wrapper = HTMLElement & {
    state:        Record<string, unknown>;
    _subs:        Station;
    _listCache:   ListCache;
    _unsubs:      Off[];
    _isSyncing?:  boolean;
    put:          (key: string, val: unknown | ((prev: unknown) => unknown)) => void;
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

// `where`'s v1 predicate grammar — single-clause matchers against item
// fields. `!field` matches falsy; `field` matches truthy; `field=value`
// compares against a JSON-parsed value (so `done=true` becomes a boolean
// compare, `name=Ali` falls back to the literal string). Anything richer
// — boolean compositions, comparisons, deep paths — is a custom formatter.
// When the param was a pURL (`?where=/filter`), `arg` arrives already
// resolved to whatever was at that channel; the formatter coerces it to
// the predicate string before parsing.
const matchesPredicate = (item: unknown, arg: string): boolean => {
    if (!arg || !item || typeof item !== 'object') return Boolean(item);
    const obj = item as Record<string, unknown>;
    if (arg.startsWith('!')) return !obj[arg.slice(1)];
    const eq = arg.indexOf('=');
    if (eq === -1) return Boolean(obj[arg]);
    const field = arg.slice(0, eq);
    const rawValue = arg.slice(eq + 1);
    let value: unknown;
    try { value = JSON.parse(rawValue); } catch { value = rawValue; }
    return obj[field] === value;
};

export const DW_FORMATTERS = new Map<string, Formatter>([
    // #region formatters
    // @docs Append `?formatter=arg` to any pURL to pipe its value through a
    // transformer. The pipeline runs left-to-right in URL order: every
    // recognised key applies its formatter with the param value as the
    // argument. Legacy syntax `?format=name` still works — `format` is a
    // meta-key that dispatches to a named formatter with no argument.
    //
    // Collection ops (operate on arrays):
    ['where',    (v, arg) => Array.isArray(v) && arg != null && arg !== ''
        ? v.filter(i => matchesPredicate(i, typeof arg === 'string' ? arg : String(arg)))
        : v,
    ],
    // Value ops (drill / size):
    ['get',      (v, arg) => arg ? readPath(v, typeof arg === 'string' ? arg : String(arg)) : v],
    ['length',   v => (Array.isArray(v) || typeof v === 'string') ? v.length : 0],
    // Existing transforms:
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
