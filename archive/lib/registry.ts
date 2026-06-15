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

export type ComponentBindingRuntime = {
    has:            (name: string) => boolean;
    source:         (name: string) => Source;
    activateAction: (name: string) => Off | null;
};

// #region event-dispatch
// @docs One delegated listener per `@event` token, attached to the wrapper.
// Native browser bubbling carries the event up; the listener filters out
// events owned by nested wrappers, then emits the topic named on the
// declaring element along with a `DispatchDetail`. Adding handlers to
// dynamically-inserted DOM costs nothing — the listener is already installed.
// Component actions read the originating DOM event directly through standard
// accessors (`event.target.value`, `event.target.checked`, `new FormData(form)`)
// — no framework-side harvest. `item` rides the detail when the event fires
// inside a `*list` row, so row-scoped handlers don't have to walk the DOM.
export type DispatchDetail  = {
    originalEvent: Event;
    path:          string;  // parsed pURL path
    isRel:         boolean; // pURL was relative (`./`)
    item?:         Item;    // row item when the @-event fired inside a *list row
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
    _component?:  ComponentBindingRuntime;
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
    ['not',      v => !v],
    // `?format=onoff` → 'on' / 'off'. `?onoff=truthyLabel:falsyLabel` →
    // user-supplied labels (e.g. `?onoff=done:active` for the todos toggle).
    // The param-name form receives the arg; the legacy `?format=onoff` form
    // calls with no arg and gets the original on/off labels.
    ['onoff',    (v, arg) => {
        if (arg == null || arg === '') return v ? 'on' : 'off';
        const [t, f = ''] = String(arg).split(':');
        return v ? t : f;
    }],
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

// A protocol resolves a pURL like `localStorage://todos` to a value.
// Handler shape is the bidirectionality contract: a bare function (or an
// object with only `read`) is read-once; an object exposing `write` is
// read-write — wire() composes a writeback automatically when the sink
// is a wrapper-data-* slot. No flag at the binding site.
export type ProtocolHandler =
    | ((purl: pURL, wrapper: Wrapper) => unknown)
    | {
        read:   (purl: pURL, wrapper: Wrapper) => unknown,
        write?: (purl: pURL, value: unknown, wrapper: Wrapper) => void,
    };

// #region source
// @docs The contract `wire()` consumes for every `$` and `*` token, and
// the put: listener consumes for every write. `resolve()` (in engine.ts)
// returns one of these for any pURL by looking up a Handler — the built-in
// DEFAULT_HANDLER for default-protocol pURLs, a registered ProtocolHandler
// for non-default ones. Wire() never branches on where the value came from.
//
// All four methods are total. `subscribe` is the read-side stream: it
// fires once on attach with the current value, then fires again on each
// publish for reactive sources or never again for one-shot ones. The Off
// it returns is meaningful for reactive sources, a no-op for one-shot
// ones — wire() pushes it onto `unsubs` iff `escapes` is set.
//
// `read` is a one-shot value getter — symmetry with `write`; rarely used
// directly since `subscribe` fires once initially. `write` round-trips
// values back to the source's origin (`wrapper.put` for state-channel,
// `handler.write` for protocol handlers, noop for handlers that don't
// expose write).
//
// The writeback at engine.ts:478 (when a non-default protocol is sunk
// into `$data-*` on a wrapper) gates on protocol identity, not on
// `write` presence — every Source has `write` now, but only non-default
// protocols opt into bidirectional state sync. Default-protocol sources
// don't get writeback subscribed, avoiding cycles like `$data-foo="/bar"`
// where writing back foo would re-trigger bar.
//
// `escapes` tells wire() the subscription leaves local scope — a row's
// `/absolute` path subscribing to the wrapper, a `//host/` path crossing
// wrapper boundaries. Tracked for teardown.
export type Source = {
    read:      ()           => unknown;
    write:     (v: unknown) => void;
    subscribe: (cb: Sub)    => Off;
    escapes:                   boolean;
};

// `resolve()` returns both the source and the wrapper that formatters
// resolve `/path`-shaped param values against. They travel together —
// a `//host/path` DWRL names another wrapper as the formatter context
// alongside the source.
export type Resolution = {
    source: Source;
    target: Wrapper;
};
// #endregion

export const DW_PROTOCOLS = new Map<string, ProtocolHandler>([
    // #region protocols
    // @docs Resolvers for non-DWRL pURLs that appear as `$` and `*`
    // attribute values (`<data-wrapper $data-todos="localstorage://todos">`,
    // `<ul *list="localstorage://snapshot">`, ...). `resolve()` looks the
    // protocol up here and wraps the handler in a `BindingSource` — its
    // `subscribe` fires once with the read value (one-shot — no
    // in-process pub/sub from storage); `write`, if exposed, gets carried
    // through and wire() composes a writeback on the wrapper's matching
    // state channel for any wrapper-data-* sink.
    //
    // **Handler shape is the bidirectionality contract.** A bare function
    // (or `{read}`-only object) is read-once: wake reads the value into
    // the sink and that's that. An object exposing `write` is read-write:
    // every state change on the bound dataset key propagates back through
    // `write`. No `?sync` flag at the binding site — the shape decides.
    //
    // **JSON-round-trip is the storage convention.** Handlers that
    // persist structured values should `JSON.parse` on read and
    // `JSON.stringify` on write to match dataset semantics. String-valued
    // sources (a future `url://?param=...`) can skip the parse but
    // should accept stringified writes when bidirectional.
    //
    // **`write` init-fires once on attach.** The writeback subscription
    // uses the framework's `subscribe()` primitive, which fires every
    // sub with its initial value — so the just-read value gets written
    // back immediately. For `localstorage:` that's idempotent. Protocols
    // with expensive or non-idempotent writes (a future `api://` POST)
    // should guard internally or expose `read`-only.
    //
    // Keys are lowercase by URL-spec convention — `new URL()`
    // lowercases the protocol scheme, so we register under the same
    // form. Devs write `localStorage://` for readability; the parser
    // normalises it on the way through.
    //
    // Custom protocols: `DW_PROTOCOLS.set('api', (purl) => fetch(...))`.
    ['localstorage', {
        // `localstorage://todos` → host is `todos`. URL parsing places
        // the first segment after `://` in `hostname` (lowercased),
        // not in `pathname`. localStorage keys are flat, so host is
        // the key. Case-sensitivity caveat: keys are lowercased by URL
        // parsing — use lowercase localStorage keys to match.
        //
        // On a missing key, fall back to the wrapper's current state at
        // the matching dataset slot — the inline `data-<host>="…"` default.
        // This makes the seeded-default pattern declarative: declare the
        // initial value on the wrapper, bind `$data-<host>="localstorage://<host>"`,
        // and the framework seeds storage on first load while honoring saved
        // state on subsequent loads. Convention: storage host string matches
        // the dataset key (after URL hostname lowercasing).
        read: (purl, wrapper) => {
            const raw = localStorage.getItem(purl.host);
            if (raw == null) return wrapper.state[purl.host];
            try { return JSON.parse(raw); } catch { return raw; }
        },
        write: (purl, value) => {
            if (value === undefined) { localStorage.removeItem(purl.host); return; }
            localStorage.setItem(purl.host, JSON.stringify(value));
        },
    }],
    // #endregion
]);
