# data-wrapper framework

`data-wrapper` treats the browser as the framework. HTML declares data
relationships through attributes; the custom element owns the data,
subscriptions, list caches, and event routing. There is no virtual
DOM, no template compiler, no runtime expression parser. The browser
parses pURLs with `new URL()`; the framework compiles them once at
wake time into subscribers; updates dispatch values into those
subscribers, never re-parsing.

This document captures **design intent and decisions** — the things a
reader can't recover by reading `src/lib`. For mechanics, read the
code.

Two parts:

- **Stable** — locked in. Implementation may drift; the contract does not.
- **Roadmap** — open design surface. Spec first, code second.

---

# Stable

## Core Rule

The DOM is declarative. `data-wrapper` owns the logic. DOM nodes hold
attributes and rendered output. Runtime framework state lives on the
wrapper. Framework-owned DOM markers use underscore-prefixed attributes
(`_live`, `_empty`) — visible debugging flags, not subscription storage.

## Reserved Attribute Sigils

The first character of an attribute name determines who owns it:

| Sigil    | Owner     | Meaning                                          |
| -------- | --------- | ------------------------------------------------ |
| `$`      | framework | Bind DOM property/attribute to wrapper state     |
| `*`      | framework | Directive (`*list`, `*if`, …)                    |
| `@`      | framework | Native event → emitted action topic              |
| `_`      | framework | Injector / private marker (Roadmap)              |
| `data-*` | shared    | Wrapper state (user) and config (framework)      |
| other    | author    | Standard HTML; ignored by `wire()`               |

The sigil-as-namespace contract is the only thing keeping framework
behavior out of regular HTML. Don't expand it without a clear reason.

## pURLs

A pURL ("Pearl"; internally DWRL) is the locator string passed to a
sigil attribute. It's a URL — parsed by `new URL()` against the base
`dwrl://data-wrapper/`. Why a URL: the browser already engineered the
parser, and the URL shape (path, query, host, hash) maps naturally to
the things bindings need to express (location, modifiers, target,
debugging).

### Path forms

- `/key` — wrapper-scoped state, resolves on the closest
  `<data-wrapper>` ancestor.
- `./key` — item-scoped, only meaningful inside a `*list` row.
- `topic/name` — action topic for `@` tokens. Becomes the
  `CustomEvent` name.

### Stable query conventions

- `?format=name` — pipe through `DW_FORMATTERS`. Repeated keys compose
  left-to-right. Captured once at wake by tokens that opt in.
- `?key=name` — row identity for `*list` (defaults to `'id'`).
- **Booleans** — presence wins. `?prevent` and `?prevent=true` are
  equivalent. To turn off, omit. No custom value parsing.

`pURL()` is a pure parser — no registry lookups. Consumers (e.g. the
`$`-subscriber) compose their format pipeline from `purl.params`.
This keeps the parser dependency-free and the result serializable.

`#debug` on a pURL logs its parse to the console.

## @ Event Dispatch

The `@` token connects a native DOM event to a framework action with
**form-submission semantics**: the actionTarget is the submitter,
named controls supply the payload, registered handlers replace
navigation.

```txt
form action     ~  @event purl
submitter       ~  actionTarget
FormData        ~  payload
navigation      ~  registered handler dispatch
```

The pURL path becomes the action name (`event.type` on the dispatched
CustomEvent). Query params are reserved for dispatch options —
`?prevent`, `?stop`, `?immediate` — applied to the originalEvent
before dispatch. They aren't echoed into `detail`: they're declarative
side effects, not runtime information the handler needs.

`event.detail` carries the minimum: `originalEvent` and `payload`.
Everything else is already on the event natively:

| Want…          | Read…                                         |
| -------------- | --------------------------------------------- |
| action name    | `event.type`                                  |
| actionTarget   | `event.target`                                |
| wrapper        | `event.currentTarget`                         |
| native event   | `event.detail.originalEvent`                  |
| was prevented? | `event.detail.originalEvent.defaultPrevented` |
| form data      | `event.detail.payload`                        |

Three buckets — **path, options, payload** — are kept non-overlapping
on purpose. Query strings carry framework flags only; payload comes
from named controls; the path is the action name. `data-*` attributes
don't contribute to payload. To ship data with an action, give the
element `name` and `value`. That matches native HTML form semantics:
unnamed controls don't submit, named ones do.

If the actionTarget is a `<form>`, payload is its FormData. Otherwise
it's the actionTarget's own `{name: value}` if it has one. Repeated
names become arrays.

Nested `@event` declarations of the same event type all fire in DOM
order, per native bubbling. `?stop` is the escape hatch.

## Event Primitives

`on(name, cb, delegate?, ctx?)` is `addEventListener` plus optional
delegation. When `delegate` is provided (Element or selector), the
match is filtered by identity (`delegate.contains(e.target)`) and
exposed as `event.actionTarget`. The `actionTarget` property is the
only augmentation the framework makes to `Event` — it lives alongside
`target` and `currentTarget` as a peer concept.

`emit(name, detail?, ctx?)` dispatches a bubbling `CustomEvent`.
Detail is whatever the caller provides; no merging or parsing.

Both deal in **bare action names** (`'todos/add'`), not pURL strings.
pURL parsing happens at the `@` token boundary in `wire.ts`. Action
names use `/` as separator — `:` is reserved by URL semantics
(`new URL('data:sync', base)` resolves to protocol `data:`, silently
dropping the prefix).

`register()` loops `on()` with an extra filter: handlers fire only
when `event.target.closest('data-wrapper') === this`. Without it, an
outer wrapper would catch an inner wrapper's bubbled actions. The
cost is one `closest()` call per dispatch — paid in microseconds.

We considered a `_boundEvents`-style listener-dedup mechanism (one
listener per event type, internal routing). Deliberately not built:
it required wrapper state, lazy attribute re-parsing at dispatch
time, and tangled routing with attribute lookup. The simpler
identity-filtered model installs N listeners but each early-exits on
non-match. If N ever becomes a bottleneck for huge lists, a routing
layer can be added under `wire.ts` without changing `on`/`emit`/`register`.

## Wake & Wire

`wake(root)` walks the subtree once, skipping nested wrappers,
`<template>`, and SVG. Sigil-attribute elements get tagged `_live`
and routed through `wire()`, which compiles the pURL into a
subscriber registered against `purl.path`. Idempotent — re-wakes skip
`_live` nodes but keep walking past them.

**Compile once at wake; dispatch forever.** No runtime update
re-parses attributes or rebuilds the binding.

## Subscriptions

The one update primitive is the subscriber: `(value) => void`.
Subscribers live on the wrapper (keyed by state path) and on rows
(inside the wrapper-owned list cache). Initial values fire
immediately at registration so the DOM matches state on first render.

External `data-*` mutations take the symmetric path: a
`MutationObserver` on the wrapper catches the change and broadcasts.
`_isSyncing` suppresses the echo from internal writes — without it,
every `put()` would re-broadcast itself.

`dw/sync` is emitted with the changed key after any state update,
for app-level observers.

## Lists & Reconcile

`*list` is a compiled directive. At wake it captures the list
element, its child `<template>`, the wrapper-owned cache, and the row
identity key (`?key=`, defaulting to `id`).

Reconciliation reuses rows by identity, broadcasts updated items to
existing row subscribers, removes stale rows, and wakes new rows
after insertion. The DOM node is rendered output; the row record is
framework state. This split is the reason lists update without
re-parsing the template and without forcing rerenders of unchanged
rows.

## Extensibility

`DW_DIRECTIVES`, `DW_FORMATTERS`, and `DW_TEMPLATES` are exported
`Map`s. User code adds entries or overrides built-ins with
`Map.set()`. Last write wins. Templates declared in the document
(`<template id="…">`) take precedence over registered ones.

The Map-as-registry choice trades type safety for ergonomics:
overriding `count` or `currency` is one line of app code, no
configuration object, no plugin lifecycle.

## View Loading

A wrapper with `src="<url>"` calls `load()` on connect. For `.js` /
`.mjs`, it dynamic-imports and calls `default(wrapper)`. For HTML, it
fetches, replaces `innerHTML`, resets subs and the list cache, clears
`_live`, and re-wakes. `dw/loaded` is emitted on completion.

**Caveat:** `<script>` tags inside src-loaded HTML do not execute
(HTML5 `innerHTML` rule). Loaded views must initialize via the inline
`onload=""` attribute (which fires on the framework's `load` event)
or via a `.js` controller. This is why `onload=""` is the canonical
init pattern for HTML partials, not script-tag colocation.

## Lifecycle Events

The framework emits a small set on the wrapper. Each bubbles. The
wrapper is reachable via `event.target`; `detail` carries only what
isn't derivable from the dispatch context.

| Event       | When                                | `detail`           |
| ----------- | ----------------------------------- | ------------------ |
| `load`      | Wrapper connected and woken         | `undefined`        |
| `dw/load`   | Alias for `load`, slash-namespaced  | `undefined`        |
| `dw/sync`   | A state key changed                 | `{ key: string }`  |
| `dw/loaded` | `src` fetch finished                | `{ src: string }`  |

`load` exists alongside `dw/load` so the browser-native inline
`onload=""` attribute fires. The framework's preferred form is
`dw/load`, but `load` is the affordance that makes one-liner
initialization in loaded views possible.

## Accepted Complexity

Some complexity serves DX and should remain:

1. `put` / `patch` / `push` / `pull` as mutation helpers.
2. `register()` as bulk subscription sugar with wrapper-ownership filter.
3. `_isSyncing` to suppress reflect-back loops.
4. Delegated events keep updates O(1) when DOM is added.

---

# Roadmap

Provisional. Spec first, code second.

## pURL — extended fields

`p()` exposes raw URL parts not yet bound to behavior:

- **`host`** — mesh. `//other-wrapper/key` should bind to a named
  sibling wrapper's state. Resolution strategy undecided (id lookup?
  closest named ancestor? document-wide registry?).
- **`protocol`** — `api://path` for fetch-driven injectors. Other
  protocols TBD.

## pURL query-param conventions

Stable: `?format=`, `?key=`, the boolean rule, and `@` dispatch
options. Open:

- Parametrized formatters: `?format=date:short`, `?format=currency:EUR`.
- Custom user options. The query string is currently
  framework-reserved on every token. Opening it to user-defined params
  would need a discrimination rule (prefix? explicit allowlist?).

## `@` dispatch — deferred options

Stable: `prevent`, `stop`, `immediate`. Tentative:

- `once` — remove the listener after one dispatch.
- `capture` — listen in the capture phase (for `focus`/`blur`).

## `@` payload modes

Stable default: form-FormData for `<form>` actionTargets; `{name:
value}` otherwise; repeats become arrays. Future opt-in:

- `?payload=subtree` — collect named controls from the actionTarget's
  subtree even when it isn't a `<form>`.
- `?payload=scope` — collect from the closest form-like ancestor.
- `?payload=none` — explicit empty payload.

## `_` token (Injector)

`_attr="<purl>"` runs once at mount and populates state. Sketches:

- **State Island:** `_state` reads a child
  `<script type="application/json" data-dw-state>` and patches the
  proxy before `wake()`.
- **`api://` fetch:** `_users="api://v1/users"` GETs on mount and
  writes JSON to `state.users`. Loading/error/empty render via
  `dw-loading` / `dw-error` / `dw-empty` templates.
- **URL sync:** `_sync="url?keys=filter,page"` hydrates listed keys
  from `location.search` on mount and mirrors changes back.

Open: one sigil `_` covering three jobs vs split tokens? Reactivity
(re-run on param change, or only at mount)? Hydration order (precede
`wake()` to avoid flicker)? Namespace conflict with framework-owned
markers (`_live`, `_empty`) — reserve `_dw*`, or move markers to
`data-dw-*`?

## Address-bar sync

`_sync="url?keys=…"`:

- `replaceState` doesn't fire `popstate`, so Back/Forward can't revert
  state unless `pushState` is used. Candidate: `replaceState` by
  default, opt in with `?push`.
- Overlapping keys across wrappers — error, last-wins, or scoped?
- Encoding non-primitives — string-only, or JSON-encode in the query
  string?

## Formatters

Built-ins: `count`, `fallback`, `json`, `upper`, `lower`, `currency`,
`date`, `trim`, `bool`, `onoff`, `yesno`. Open:

- Parametrized formatters (see query-param conventions).
- Locale / i18n strategy for `currency` and `date`.

---

## Pressure Points

For Stable and Roadmap alike:

1. Can this work be compiled during `wake()`?
2. Can this update become a subscriber call?
3. Does this state belong to the wrapper instead of a DOM node?
4. Is this helper expressing a real framework concept, or just
   renaming one line of JavaScript?
5. Is this complexity improving DX, or protecting the framework from
   its own abstraction?
6. Does this abstraction lean **toward** the DOM (CustomEvent,
   FormData, URLSearchParams) or away from it? The browser already
   engineered the hard parts; reach for them before inventing.
