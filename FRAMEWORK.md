# data-wrapper framework

`data-wrapper` treats the browser as the framework. HTML declares data
relationships with attributes; the custom element owns the data,
subscriptions, list caches, and event routing.

There is no virtual DOM, no template compiler, and no runtime expression
parser. The browser parses pURLs with native `new URL()`. The framework
wires them once at wake time into subscribers, then dispatches values
into those subscribers when state changes. Any single state update
touches only its registered subscribers — DOM updates are O(1) in the
size of the page.

This document splits into two parts:

- **Stable** — locked in. Implementation may drift; the contract does not.
- **Roadmap** — open design surface. Spec first, code second.

---

# Stable

## Core Rule

The DOM is declarative. `data-wrapper` owns the logic.

DOM nodes hold attributes and rendered output. Runtime framework state
lives on the wrapper: wrapper state, root subscriptions, list row
caches, row subscriptions, and delegated event registrations.

Framework-owned DOM markers use underscore-prefixed attributes (`_live`,
`_empty`). They are visible debugging flags, not subscription storage.

## Reserved Attribute Sigils

The first character of an attribute name determines who owns it:

| Sigil    | Owner     | Meaning                                              |
| -------- | --------- | ---------------------------------------------------- |
| `$`      | framework | Bind DOM property/attribute to wrapper state         |
| `*`      | framework | Directive (`*list`, `*if`, …)                        |
| `@`      | framework | Native event → emitted action topic                  |
| `_`      | framework | Injector / private marker (see WIP)                  |
| `data-*` | shared    | Wrapper state (user) and config (framework)          |
| other    | author    | Standard HTML; ignored by `wire()`                   |

## Tokens

- **`$prop="<purl>"`** — subscribe `el[prop]` (or attribute fallback) to
  state at `purl.path`. The compiled subscriber is the only runtime
  code path that touches this element for this property. Formatters in
  the query string transform the value before assignment.

- **`*directive="<purl>"`** — run a directive registered in
  `DW_DIRECTIVES` once at wake. The directive returns a subscriber
  that is registered against `purl.path`. Built-ins: `list`, `if`.

- **`@event="<purl>"`** — install a delegated listener on the wrapper
  for native event `event`. When it fires, emit the action topic at
  `purl.path` from the originating element.

In all three, `<purl>` follows the pURL protocol below.

## pURLs

A pURL ("Pearl"; internally DWRL — Data Wrapper Resource Locator) is
the locator string passed to a `$`/`*`/`@`/`_` attribute. It is parsed
once by `p()` (`utils.ts`) using the native `URL` parser against the
base `dwrl://data-wrapper/`.

`p()` is the canonical parser. Anything that reads a pURL goes through
it. The returned object is plain data: URL accessors are captured
explicitly so destructuring is safe.

### Stable fields

```ts
type pURL = {
  path:    string                  // pathname without leading '/'
  isRel:   boolean                 // true when source string starts with './'
  key:     string | undefined      // ?key= override (used by *list identity)
  params:  URLSearchParams         // remaining query params
  format:  (v: unknown) => unknown // pipeline composed from ?format=…
  hash:    string                  // '#debug' enables console trace
}
```

### Path forms

- **`/key`** — wrapper-scoped state. Resolves on the closest
  `<data-wrapper>` ancestor.
- **`./key`** — item-scoped. Only meaningful inside a `*list` row;
  resolves on the row's `item`.
- **`topic/name`** — action topic for `@` tokens. Emitted as a
  `CustomEvent` of that name.

### Stable query params

- **`?format=…`** — repeated keys compose left-to-right through
  `DW_FORMATTERS`. e.g. `?format=date&format=upper`.
- **`?key=…`** — sets row identity for `*list` (default `'id'`).
- **Booleans** — presence wins. `URLSearchParams.has(name)` is the
  framework's truth check, so `?prevent` and `?prevent=true` are
  equivalent. Omit to leave off. No custom value parsing.

Token-specific query params (notably `@` dispatch options) are
documented in their own sections.

### Debugging

A pURL with `#debug` logs its parse to the console.

## @ Event Dispatch

The `@` token connects a native DOM event to a framework action with
form-submission semantics: the actionTarget is the submitter, named
controls supply the payload, and registered handlers replace
navigation.

### Action name

`purl.path` is the dispatched `CustomEvent` name, exactly as written.
Query params are stripped before dispatch.

```html
<button @click="todos/remove?prevent">
```

dispatches the action `todos/remove`. `register({ 'todos/remove': … })`
matches.

### Dispatch options

Query params on an `@` pURL are reserved for framework dispatch
behavior. They do not become payload. Initial set:

| Option      | Effect                                     |
| ----------- | ------------------------------------------ |
| `prevent`   | `originalEvent.preventDefault()`           |
| `stop`      | `originalEvent.stopPropagation()`          |
| `immediate` | `originalEvent.stopImmediatePropagation()` |

Booleans follow the stable query-param rule (`.has()` is truth).

### actionTarget

The element carrying the `@event` attribute is the `actionTarget`. It
is distinct from native event fields:

```txt
originalEvent.target         deepest native event target
originalEvent.currentTarget  data-wrapper delegation root
detail.actionTarget          element declaring the action
```

`actionTarget` is intentionally framework-specific — it avoids
overloading native `currentTarget` and side-steps jQuery's
`delegateTarget` convention.

### Payload

Payload comes from named controls, like an HTML form:

- If `actionTarget` is a `<form>`, payload is built from its
  successful named controls (`new FormData(actionTarget)`).
- Otherwise, payload is `{ [actionTarget.name]: actionTarget.value }`
  when `actionTarget.name` is set, else `{}`.

Repeated names become arrays. Two controls named `tags` produce
`{ tags: ['a', 'b'] }`, matching how server-side form parsers handle
multi-value submissions.

`data-*` attributes do not contribute payload. To ship data with an
action, give the element `name` and `value`. This matches native form
behavior and keeps the buckets — path, options, payload —
non-overlapping.

### Detail shape

`register()` handlers receive a `DispatchEvent` — a `CustomEvent`
typed against a fixed dispatch contract:

```ts
type DispatchOptions = {
  prevent:   boolean
  stop:      boolean
  immediate: boolean
}

type DispatchPayload = Record<string, FormDataEntryValue | FormDataEntryValue[]>

type DispatchDetail = {
  originalEvent: Event              // the native DOM event
  wrapper:       Wrapper            // delegation root
  actionTarget:  Element            // declarer
  eventType:     string             // e.g. "click"
  action:        string             // e.g. "todos/remove"
  options:       DispatchOptions
  payload:       DispatchPayload
}

type DispatchEvent = CustomEvent<DispatchDetail>
```

`DispatchOptions` is a closed shape at v1. Every known dispatch flag
is a field of this type; missing options default to `false`. Adding a
new option (e.g. the deferred `once`, `capture`) is a type bump.
Reopening this to a `Record<string, boolean>` is on the Roadmap if
the option set proves to need user extension.

### Bubbling

Native bubbling carries the event up to the wrapper. Nested `@event`
declarations of the same event type all fire in DOM order; `?stop` is
the escape hatch.

### Design principle

`@event` is form submission without navigation:

```txt
form action     ~  @event purl
submitter       ~  actionTarget
FormData        ~  payload
navigation      ~  registered handler dispatch
```

## Render Lifecycle

1. `<data-wrapper>` connects.
2. The wrapper observes its own `data-*` attributes via
   `MutationObserver`.
3. The wrapper calls `wake(this)`.
4. `wake()` walks its subtree with a `TreeWalker`. Nested wrappers,
   `<template>`, and SVG are skipped.
5. For each visited element with tokenized attributes, the wrapper
   tags it `_live` and routes each tokenized attribute through
   `wire()`.
6. `wire()` parses the pURL, compiles the subscriber, and registers it
   either on the wrapper (`_subs`) or on the current row (`row.subs`).

`wake()` is idempotent. Elements already tagged `_live` are skipped;
the walk continues into their subtrees.

## Subscriptions

One update primitive:

```ts
type Sub<T = unknown> = (value: T) => void;
type Subs<T = unknown> = Sub<T>[];
```

Wrapper state subscriptions are keyed by state path:

```ts
_subs: Record<string, Subs>
```

List row subscriptions are keyed by row identity inside wrapper-owned
list caches:

```ts
_listCache: Map<Element, Map<unknown, Row>>
Row = { node, item, subs }
```

Shared wrapper shape:

```ts
Wrapper = HTMLElement & { state, _subs, _listCache, _watch }
```

`watch(subs, sub, value)` stores a subscriber and immediately runs it
for initial render. `broadcast(subs, value)` only calls stored
subscribers.

## State Updates

`put()`, `patch()`, `push()`, and `pull()` all converge on `put()`.

1. `put()` computes the next value.
2. `state[key] = next` writes through the Proxy into `dataset`.
3. The Proxy serializes objects to JSON and strings everything else.
4. `_isSyncing` suppresses the MutationObserver echo from internal
   writes.
5. `_broadcast(key, value)` calls subscribers for that key.
6. `data:sync` is emitted for app-level derived state.

External `data-*` mutations take the MutationObserver path:

1. The observer sees a `data-*` attribute change.
2. The attribute name converts to a dataset key.
3. The wrapper reads `state[key]`, including JSON parsing.
4. `_broadcast(key, value)` updates subscribers.

## Lists

`*list` is a compiled directive.

At wake time the directive captures the list element, its direct child
`<template>`, the wrapper-owned cache for that list, the `wake()`
function used for inserted DOM, the row identity key (`?key=` or
default `'id'`), and the current empty-state node reference if any.

At update time the list subscriber:

1. Empty lists clear row DOM and row cache.
2. Empty lists render the configured `data-empty` template once.
3. Generated empty-state nodes are tagged `_empty`.
4. Generated empty-state nodes are woken with no row.
5. Non-empty lists remove the empty-state node and call `reconcile()`.

`reconcile()`:

1. Reuses existing rows by identity.
2. Creates new rows as `{ node, item, subs: [] }`.
3. Broadcasts updated item values to existing row subscribers.
4. Removes stale rows from the DOM and cache.
5. Appends rows through a `DocumentFragment`.
6. Wakes new row nodes after insertion so `wake()` can use DOM
   ancestry.

Row logic lives inside the wrapper-owned cache. The DOM node is
rendered output; the row record is the framework state.

## Extensibility

Directives, formatters, and named templates live in exported `Map`s.
User code adds entries or overrides built-ins with `Map.set()`. Last
write wins.

```ts
import { DW_DIRECTIVES, DW_FORMATTERS, DW_TEMPLATES } from '@/lib/registry.ts';

DW_DIRECTIVES.set('myDir', ctx => value => { /* … */ });
DW_FORMATTERS.set('shout', v => String(v).toUpperCase() + '!');
DW_TEMPLATES.set('dw-empty', someTemplateElement);
```

Directive handler signature:

```ts
type DirectiveHandler = (ctx: {
  wrapper: Wrapper
  el:      Element
  key?:    string        // ?key= from the pURL
  row?:    Row | null
  wake:    typeof wake
}) => Sub
```

A directive runs once at wake and returns a subscriber. The subscriber
is then registered against `purl.path` on the wrapper (or on the row
for item-scoped pURLs).

Formatters are pure functions composed left-to-right via `?format=`
pipes.

`<template id="…">` elements declared in the document take precedence
over `DW_TEMPLATES` entries with the same id.

## View Loading

A wrapper with `src="<url>"` calls `load()` on connect. `load()`:

- For `.js` / `.mjs` sources, dynamic-imports the module and calls
  `default(wrapper)`. The module is responsible for any setup.
- For HTML sources, fetches the body, replaces `innerHTML`, resets
  `_subs` and `_listCache`, clears `_live`, and re-`wake()`s the
  wrapper. `data:load` is emitted on completion.

This is the primitive used to compose pages from view fragments.

## Accepted Complexity

Some complexity serves DX and should remain:

1. `put()`, `patch()`, `push()`, `pull()` as mutation helpers.
2. `register()` as bulk event subscription sugar.
3. `_isSyncing` to preserve attribute reflection without update loops.
4. Delegated events to keep updates O(1) when DOM nodes are added.

---

# Roadmap

Everything below is provisional. Pin down semantics here before
touching code. Open questions are listed; the answers are TBD.

## pURL — extended fields

`p()` exposes raw URL parts that are not yet bound to runtime
behavior:

- **`host`** — the "mesh." `//other-wrapper/key` should bind to a
  named sibling wrapper's state. Resolution strategy undecided
  (id lookup? closest named ancestor? document-wide registry?).
- **`protocol`** — `api://path` and similar for fetch-driven
  injectors (see `_` token). Other protocols TBD.

## pURL query-param conventions

`?format=`, `?key=`, the boolean rule, and `@` dispatch options are
stable. Open:

- **Parametrized formatters:** `?format=date:short`,
  `?format=currency:EUR`.
- **Custom user options:** the query string is currently
  framework-reserved on every token. When/whether to allow
  user-defined params is undecided.

## `@` dispatch — deferred options

The stable set is `prevent` / `stop` / `immediate`, modeled as a
closed `DispatchOptions` type. Additional options are tentatively
planned but not committed:

- `once` — remove the listener after one dispatch (maps to
  `addEventListener({ once: true })`).
- `capture` — listen in the capture phase, for events that don't
  bubble (`focus`, `blur`).

Open: whether to keep `DispatchOptions` closed (each new option = type
bump) or reopen it to `Record<string, boolean>` for user-defined
dispatch flags. Closed is the v1 stance.

## `@` payload modes

The default rule (form-FormData for `<form>` actionTargets,
`name`+`value` otherwise, repeats → arrays) is stable. Future opt-in
modes:

- `?payload=subtree` — collect named controls from the actionTarget's
  subtree even when it isn't a `<form>`.
- `?payload=scope` — collect from the closest form-like ancestor.
- `?payload=none` — explicit empty payload.

## `_` token (Injector)

`_attr="<purl>"` runs once at mount and populates state. Sketches:

- **State Island:** `_state` reads a child `<script
  type="application/json" data-dw-state>` and patches the proxy
  before `wake()`.
- **`api://` fetch:** `_users="api://v1/users"` issues a GET on
  mount and writes JSON to `state.users`. Loading / error / empty
  rendered via `dw-loading` / `dw-error` / `dw-empty` templates.
- **URL sync:** `_sync="url?keys=filter,page"` hydrates listed
  keys from `location.search` on mount and mirrors changes back.

Open:

- One sigil `_` covering three jobs vs split tokens (`_state`,
  `_fetch`, `_sync`).
- Reactivity: do injectors re-run when their pURL params change, or
  only at mount? Default off + opt in with `?refetch`?
- Hydration order: must precede `wake()` to avoid initial render
  flicker. Constructor or top of `connectedCallback`?
- Namespace conflict with framework-owned markers (`_live`,
  `_empty`). Reserve `_dw*` for framework, or move markers to
  `data-dw-*`?

## Address-bar sync

`_sync="url?keys=…"` two-way mirror.

- `replaceState` does not fire `popstate`, so Back/Forward cannot
  revert state unless `pushState` is used. Candidate compromise:
  `replaceState` by default, opt in with `?push`.
- Overlapping keys across wrappers — error, last-wins, or scoped?
- Encoding non-primitives — string-only, or JSON-encode objects in
  the query string?

## Formatters

Current set (`DW_FORMATTERS`): `count`, `fallback`, `json`, `upper`,
`lower`, `currency`, `date`, `trim`, `bool`, `onoff`, `yesno`.

Open:

- Parametrized formatters (see query-param conventions above).
- User registration: API and timing for app code adding to
  `DW_FORMATTERS`.
- Locale / i18n strategy for `currency`, `date`.

---

## Pressure Points

Apply to stable and WIP alike:

1. Can this work be compiled during `wake()`?
2. Can this update become a subscriber call?
3. Does this state belong to the wrapper instead of a DOM node?
4. Is this helper expressing a real framework concept, or just
   renaming one line of JavaScript?
5. Is this complexity improving DX, or protecting the framework from
   its own abstraction?
