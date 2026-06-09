# data-wrapper framework

For `data-wrapper`s, the browser *is* the framework. HTML declares data
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

## Mental Model

Three rules cover most of the surface. If a feature can't be explained
in terms of them, it's either out of scope or evidence the rules are
wrong.

1. **State lives in `data-*`.** The DOM holds it; a Proxy types it;
   DevTools reads and writes it. There is no parallel store, no
   shadow tree, no in-memory shadow of the DOM. State *is* the DOM
   attributes.

2. **Bindings are subscribers.** `$prop`, `*directive`, `$data-*`
   are all the same shape — a function that listens on a channel and
   writes somewhere. Each is compiled once at `wake()` and dispatched
   forever; runtime updates never re-parse anything.

3. **Renders are the last step of handling computed values.** A
   `$text="/active"` and a `$data-active="/todos?where=!done"` are
   structurally identical; only the sink differs (DOM property vs.
   back into dataset). The cascade *is* the render — no render
   phase, no virtual DOM diff, no scheduler. DOM mutations are the
   leaves of the publish tree; computed values are its interior
   nodes; every node is one `subscribe()` call.

Rule 3 is the lever. Whenever something looks like it should be a
"new render path" or a "new evaluation phase," it's almost certainly
expressible as another subscriber on an existing channel.

## Core Rule

The DOM is declarative. `data-wrapper` owns the logic. DOM nodes hold
attributes and rendered output. Runtime framework state lives on the
wrapper. Framework-namespaced DOM markers use underscore-prefixed
attributes (`_live`, `_empty`, `_key`, `_debug`) — visible flags, not
subscription storage. `_live`, `_empty`, and `_key` are framework-
written; `_debug` is the one user-facing flag in this namespace.
`_key` carries each `*list` row's identity for `put:./relative`
writeback lookup (see Lists & Reconcile).

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
- `/key/sub/leaf` — drills into a deeply-nested value at the root
  state key. The first segment hits the state Proxy (which parses
  JSON); subsequent segments are property access on the parsed tree.
- `./key` / `./key/sub/leaf` — item-scoped variants, only meaningful
  inside a `*list` row. Same drilling rules.
- `//id/key` — state on the wrapper with DOM id `id`, resolved by
  lookup rather than ancestry. Shipped for `$`/`*` (see Roadmap →
  host). A plain `/key` carries the default host `data-wrapper`,
  meaning "the closest ancestor wrapper."
- `topic/name` — action topic for `@` tokens (default protocol).
  Becomes the `CustomEvent` name.
- `put:/key`, `put:./key`, `put://id/key` — write-direction pURL on `@`
  tokens. Dispatches under the protocol name `put:` (the wrapper's
  auto-registered listener handles it). The path is the destination
  for the write; same `./` / `/` / `//host/` scoping rules as above.

### Stable query conventions

- `?format=name` — pipe through `DW_FORMATTERS` with no arg. Repeated
  keys compose left-to-right.
- `?<formatter>=<arg>` — same as above with an arg passed to the
  formatter. The formatter name itself is the query key; the value is
  whatever the formatter consumes. Examples: `?where=!done`,
  `?onoff=done:active`, `?get=user/name`. Multiple formatters in one
  pURL just stack params: `?where=!done&length`.
- `?<formatter>=/path` — pURL-shaped arg. The framework resolves
  `/path` against the wrapper at fire time and hands the resolved
  *value* to the formatter (not the literal string). Example:
  `?where=/filter` reads `state.filter` and uses its current value as
  the `where` predicate. Resolution is read-only at fire time — see
  Computed Values tradeoffs on multi-channel subscription.
- `?key=name` — row identity for `*list` (defaults to `'id'`).
- **Booleans** — presence wins. `?prevent` and `?prevent=true` are
  equivalent. To turn off, omit. No custom value parsing.

`pURL()` is a pure parser — no registry lookups. Consumers (e.g. the
`$`-subscriber) compose their format pipeline from `purl.params`.
This keeps the parser dependency-free and the result serializable.

`#debug` on a pURL logs its parse to the console.

## State Access

State is two layers stacked.

**`dataset`** is durable persistence — flat, string-only, visible in
DevTools, addressable from CSS attribute selectors, surviving
`innerHTML` operations. The framework writes through it so state is
inspectable without framework plugins.

**`state`** is the typed access layer over dataset. It's a Proxy:
writes JSON-serialize at the root key, reads JSON-parse on the way
out. So `<data-wrapper data-user='{"name":"Ali"}'>` already gives you
`wrapper.state.user.name === 'Ali'` for free — one dataset key, an
arbitrarily deep value beneath it.

pURL paths extend the model one segment further. A slash-separated
path walks the parsed tree: `/user/name/first` reads `state.user`
(parse), then `.name`, then `.first`. Single-segment paths are the
degenerate case — same code path, no special branch.

The wrapper's path-aware API:

| Method                   | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `wrapper.get(path)`      | Read a leaf at any depth; `undefined` for missing      |
| `wrapper.put(path, v)`   | Write a leaf; rebuilds the root key immutably          |
| `wrapper.patch(path, o)` | Merge `o` into the object at `path`                    |
| `wrapper.push(path, x)`  | Append `x` to the array at `path`                      |
| `wrapper.pull(path, p)`  | Filter `p` out of the array at `path`                  |
| `wrapper.handlePut(e)`   | Default `put:` event handler (see @ Event Dispatch).   |
|                          | Auto-registered by `connectedCallback`; override via   |
|                          | `register({'put:': cb})` to layer custom behavior.     |

**Fan-out semantics.** State is a tree; a write at path P affects
exactly the channels on P's vertical axis — P itself, its ancestors
(each a composite that contains the change), and its descendants
when the write replaces a subtree. Sibling channels are off-axis and
stay quiet. So `put('user/name', 'Bo')` fires `/user` and
`/user/name`; a binding to `/user/age` doesn't fire because it's
neither on the spine of P nor contained by it. `publishAxis()`
decides membership by pure string math on the channel name — no
value diff, no parse of the old attribute.

The information needed to be precise lives at the call site, not at
the publish boundary. `put()` carries the precise path P and
publishes a tight spine (P + ancestors). The Proxy setter
(`state.x = y`) and the `MutationObserver` (external attribute
edits, DevTools) only see the root key — they broadcast broadly on
that key's axis (root + all subscribed descendants). Direct writes
are an escape hatch; precision lives in `put()`.

Subscribers themselves never compute paths. The path is resolved
once at the publish boundary via `readPath(state, channel)`;
subscribers just receive their slice of the new value. This keeps
`subscribe`/`publish` ignorant of depth — depth lives in
`publishAxis()`, not in pub/sub.

## @ Event Dispatch

The `@` token connects a native DOM event to a framework action with
**form-submission semantics**: the actionTarget is the submitter,
named controls supply the payload, registered handlers replace
navigation.

```txt
form action     ~  @event purl
submitter       ~  actionTarget
named harvest   ~  payload   (element-aware, not FormData; see below)
navigation      ~  registered handler dispatch
```

The pURL path becomes the action name (`event.type` on the dispatched
CustomEvent) **for default-protocol pURLs**. Non-default protocols
(`put:`, future `push:`/`pull:`/`patch:`) dispatch under the protocol
name as the event topic instead — `@change="put:./done"` emits `put:`
(literal, including the colon), and the wrapper's auto-registered
`put:` listener interprets the detail. Query params are still reserved
for dispatch options — `?prevent`, `?stop`, `?immediate` — applied to
the originalEvent before dispatch.

`event.detail` carries the minimum: `originalEvent`, `payload`, `path`,
and `isRel`. Everything else is already on the event natively:

| Want…              | Read…                                         |
| ------------------ | --------------------------------------------- |
| action name        | `event.type`                                  |
| actionTarget       | `event.target`                                |
| wrapper            | `event.currentTarget`                         |
| native event       | `event.detail.originalEvent`                  |
| was prevented?     | `event.detail.originalEvent.defaultPrevented` |
| form data          | `event.detail.payload`                        |
| parsed pURL path   | `event.detail.path`                           |
| relativity flag    | `event.detail.isRel`                          |

Three buckets — **path, options, payload** — are kept non-overlapping
on purpose. Query strings carry framework flags only; payload comes
from named controls; the path is the action name. `data-*` attributes
don't contribute to payload. To ship data with an action, give the
element `name` and `value`. That matches native HTML form semantics:
unnamed controls don't submit, named ones do.

If the actionTarget is a `<form>`, payload is the harvest of its named
controls. Otherwise it's the actionTarget's own `{name: value}` if it
has one. The harvest is element-aware — checkboxes contribute their
`checked` state (boolean, not the `value=""` attribute string),
`<select multiple>` contributes an array of selected option values,
and unchecked checkboxes contribute `false` rather than being omitted
(form-submit's presence-as-truth semantic is wrong for live state).

Nested `@event` declarations of the same event type all fire in DOM
order, per native bubbling. `?stop` is the escape hatch.

### `put:` — JS-free state writes

The `put:` protocol on an `@` attribute makes a control write its value
back to state without a registered handler. The wrapper auto-registers
a `put:` listener that consumes the dispatched event and performs the
write. The pURL path declares the destination; the harvested payload
supplies the value.

```html
<input $value="/message" @input="put:/message">
<input type="checkbox" $checked="/agreed" name="agreed" @change="put:/agreed">
<form @submit="put:/draft?prevent">
  <input name="title">
  <input name="body">
</form>
<button @click="put:/filter" name="filter" value="active">Active</button>
```

| Form                       | Behavior                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| `put:/key`                 | Write to `state.key` at the local wrapper.                            |
| `put:key`                  | Same — bare path, treated as wrapper-scoped.                          |
| `put:./key`                | Row-relative. Inside a `*list` row, identity-keyed update against the |
|                            | source array via the row's `_key` marker (see Lists & Reconcile).     |
| `put://other-wrapper/key`  | Cross-wrapper write — dispatches on the named wrapper, its own        |
|                            | `put:` listener handles the write against its state.                  |

**Extraction.** The wrapper's `put:` handler reads `payload[leaf]` where
`leaf` is the path's last segment. If the payload has no matching key
(the multi-key form case), the whole payload is written instead.
Concretely:

- `put:/message` with `payload = {message: "hi"}` → `state.message = "hi"`.
- `put:/draft` with form `payload = {title, body}` → `state.draft = {title, body}`.
- `put:./done` inside a row with `payload = {done: true}` → identity-keyed
  update against the wrapper's source array; row item's `done` field flips.

**Why named controls.** `put:` reuses the same `name=` participation flag
HTML form submission already uses — unnamed controls contribute nothing
to the payload, so leaf-lookup fails and the listener writes `{}` over
the target. `name=` stays plain HTML; no path syntax in `name=`.

**Coexists with the legacy callback pattern.** `@change="todo/toggle"`
still emits the topic `todo/toggle` and any `register()`'d handler
fires as before. `put:` is the explicit opt-in for the 90% case of
"mirror this control to state"; `@event="topic"` handlers stay for
the 10% that needs transformation, validation, or multi-key cascades.

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
pURL parsing happens at the `@` token boundary in `wire()`. Action
names use `/` as separator — `:` is reserved by URL semantics
(`new URL('data:sync', base)` resolves to protocol `data:`, silently
dropping the prefix).

`register()` loops `on()` with an extra filter: handlers fire only
when `event.target.closest('data-wrapper') === this`. Without it, an
outer wrapper would catch an inner wrapper's bubbled actions. The
cost is one `closest()` call per dispatch — paid in microseconds.

Callbacks are invoked as plain function calls (no rebind to the
wrapper). **Use arrow functions** if you want `this` to refer to the
wrapper — they capture `this` lexically from the enclosing scope,
which inside an inline `onload=""` is the wrapper itself. A regular
`function (e) { this.put(...) }` body will see `this` as `undefined`
(strict) or `window` (sloppy). The framework deliberately doesn't
rebind: JS readers expect `this` to follow standard rules, and arrow
functions make the lexical-capture intent explicit at the call site.

We considered a `_boundEvents`-style listener-dedup mechanism (one
listener per event type, internal routing). Deliberately not built:
it required wrapper state, lazy attribute re-parsing at dispatch
time, and tangled routing with attribute lookup. The simpler
identity-filtered model installs N listeners but each early-exits on
non-match. If N ever becomes a bottleneck for huge lists, a routing
layer can be added at the `wire()` boundary without changing
`on`/`emit`/`register`.

## Wake & Wire

`wake(root)` walks the subtree once, skipping nested wrappers,
`<template>`, and SVG. Sigil-attribute elements get tagged `_live`
and routed through `wire()`, which compiles the pURL into a
subscriber registered against `purl.path`. Idempotent — re-wakes skip
`_live` nodes but keep walking past them.

**Compile once at wake; dispatch forever.** No runtime update
re-parses attributes or rebuilds the binding.

## Subscriptions

The framework runs on a tiny pub/sub. A **subscriber** is
`(value) => void`. Subscribers live on **Stations** keyed by
**channel**: many channels per station, many listeners per channel.
Both wrappers and rows carry their own Station — wrappers keyed by
state path, rows by the path slot each binding declared. Reading and
writing on a row is the same operation as on the wrapper; only the
target Station differs.

The radio analogy is load-bearing: think tuning in and broadcasting,
not flat callback lists. The structural symmetry between wrapper and
row Stations is what lets `*list` rows participate in the same pub/sub
model the wrapper uses, with no adapter layer between them.

Initial values fire immediately at registration so the DOM matches
state on first render.

External `data-*` mutations take the symmetric path: a
`MutationObserver` on the wrapper catches the change and publishes.
`_isSyncing` suppresses the echo from internal writes — without it,
every `put()` would re-publish its own mutation.

`dw/sync` is emitted with the changed key after any state update,
for app-level observers.

## Subscription Teardown

`subscribe()` returns an `Off` — a reference-based detach, idempotent
and order-independent (it never caches an array index). Most
subscriptions never need it: a subscriber and the node it updates
share a scope and are collected together — a `*list` row drops its
node, Station, and closures as one unit; `load()` resets the wrapper's
whole Station.

The exception is an **escaping** subscription — one whose Station
isn't its element's own scope: a `/absolute` path inside a row (binds
up to the wrapper), or a `//host/` path (binds to another wrapper).
Its `Off` is recorded on the local scope's `unsubs` list. `unwire()`
runs a batch of them on row eviction; `unwake()` tears down a whole
wrapper — its own escapes and every cached row's — on `load()`.
Escapes are the only subscriptions tracked for teardown; in-scope subs
cost nothing.

`publish()` iterates a snapshot of the channel, so a subscriber that
detaches another mid-broadcast can't corrupt the pass.

**One primitive, every binding.** `$text="/name"` is a subscriber
that writes to `el.textContent`. `$data-active="/todos?where=!done"`
is a subscriber that writes back into the wrapper's own dataset (via
`put()`). `*list="/items"` is a subscriber that reconciles DOM
children. They share a Station, share `subscribe()`, share the
init-fire-then-on-publish protocol. This is Rule 3 in mechanical
form: renders and computed writes differ only in their sink.

## Lists & Reconcile

`*list` is a compiled directive. At wake it captures the list
element, its child `<template>`, the wrapper-owned cache, and the row
identity key (`?key=`, defaulting to `id`).

Reconciliation reuses rows by identity, fans out updates over the
row's channels, removes stale rows — unwiring any escaped
subscriptions they held — and wakes new rows after insertion. The DOM
node is rendered output; the row record is framework state. This split
is the reason lists update without re-parsing the template and without
forcing rerenders of unchanged rows.

**Row identity markers.** Each freshly-cloned row gets a `_key="<id>"`
attribute set during reconcile — the same value the cache map keys on.
This is what makes row-relative `put:` writes (`put:./done` inside a
row) resolvable without a parallel JS lookup table: `handlePut`'s
relative-path branch walks `closest('[_key]')` from the firing element
to the row, reads the `_key` attribute to identify which item to
update, and parses the containing `*list` attribute for the array path
and keyProp. The immutable update routes through `wrapper.put(arrayPath,
...)`, so the existing `publishAxis` cascade re-broadcasts to every row
subscriber — no special-case re-render path.

## Computed Values

A `$data-*` attribute on the wrapper itself declares a **computed
value** — a pURL whose evaluation is written back to the matching
`data-*` slot. There is no new primitive: a computed value is a
`$`-binding whose **sink** happens to be the wrapper's own dataset
rather than a DOM property. `bind()` returns a setter that routes
through `put()` for that one prop family; the cascade falls out of
the existing pub/sub.

The reverse of this rule is what makes the system tick: a DOM
binding (`$text`, `$class`, `*list`, …) has the *same* shape, just
with a different sink — `el.textContent`, `el.className`, the
reconciler. Computed values forward writes back into the publish
tree upstream of renders; renders consume them downstream. One
subscriber shape covers both halves; the framework needs no concept
of "computation phase" vs. "render phase."

```html
<data-wrapper data-todos='[…]' data-filter="all"
              $data-active="/todos?where=!done">
  <span $text="/active?length"></span>   <!-- "items left" -->
</data-wrapper>
```

`$data-active` reads `/todos`, filters via the `where` formatter,
writes the result through `put()` into `data-active`. `data-active`
is then addressable by any DWRL the same way `data-todos` is — DOM
bindings can subscribe to `/active` without knowing it's derived.

**Mechanics.** `wire()` treats `$data-active` like any `$`-binding:
parse pURL, subscribe to the main path channel, fire on init and
every publish. `bind(wrapper, 'data-active')` returns
`val => wrapper.put('active', val)`. Each fire runs the formatter
pipeline and writes back through `put`, which calls `publishAxis()`
on the output channel; downstream subscribers (DOM bindings on
`/active`, or further `$data-*` declarations reading `/active`)
fire synchronously in cascade order.

**Cascade.** A chain `$data-c="/b?…"`, `$data-b="/a?…"` resolves
itself: `put('a', …)` publishes `/a`, which fires `$data-b`'s
update, which calls `put('b', …)`, which publishes `/b`, which
fires `$data-c`'s update, and so on. No scheduler, no topological
sort — the pub/sub primitive carries the order. The framework's
own writes pass through `_isSyncing` so the `MutationObserver`
doesn't re-publish them.

**External edits.** A DevTools or third-party write to a
computed-bound `data-*` proceeds normally — the MO catches it and
`publishAxis` fires subscribers. The framework also `console.warn`s
once per attribute (per session) that the value will be overwritten
on the next upstream flush. The wrapper's own DOM is the registry:
`hasAttribute('$data-active')` answers "is this key computed?"
without any auxiliary state. Once the upstream channel publishes,
the binding re-evaluates and overwrites the external edit. The
user's edit is honored for as long as the upstream is stable; the
declaration wins as soon as anything moves.

**Tradeoffs.**

- **Single-channel subscription.** A `$data-*` binding subscribes to its
  main path only. Formatter pURL args (`?where=/filter`) *resolve*
  against the wrapper at fire time but don't *subscribe* to their
  channel. So `$data-view="/todos?where=/filter"` recomputes when
  `/todos` changes but stays stale when `/filter` changes. Workarounds:
  re-publish the main channel from a `dw/sync` listener, or compute the
  multi-source value imperatively. Lifting this to true multi-channel
  subscription is a known roadmap item.
- **No batched flush.** A diamond — `/d` reading both `/b` and `/c`, both
  derived from `/a` — fires `/d` twice on a `/a` write. Bounded but
  redundant.
- **No wake-time cycle detection.** A circular `$data-*` graph either
  stabilizes via `prev === next` on primitive values or stack-overflows
  on objects.

All three land in a future polish stage, motivated by real dogfood.

## Source Resolution

Every `$` and `*` binding reads from a **source** — a `Source` returned
by `resolve(pURL, ctx)`. The token chooses behavior (sink for `$`,
directive for `*`); the source chooses where values come from. `wire()`
doesn't branch on source type — both code paths call
`source.subscribe(sub)` and trust the shape.

```ts
type Source = {
    read:      ()           => unknown;  // one-shot getter (symmetry with write)
    write:     (v: unknown) => void;     // total — every source can be written
    subscribe: (cb: Sub)    => Off;      // fires once on attach, then on each publish
    escapes:                   boolean;  // subscription leaves local scope?
};
```

**One pipeline.** `resolve()` looks up a `Handler` and wraps its three
methods with the bound ctx. The default `dwrl:` protocol is itself a
handler (`DEFAULT_HANDLER`) that reads/writes the wrapper's dataset and
subscribes against its station. Non-default protocols (`localstorage://`,
future `url://`, `api://`) bridge through `toHandler(...)` into the same
canonical shape. The distinction between "state-channel source" and
"protocol-handler source" exists only as different `Handler`
implementations; the call site sees one `Source` interface.

**Handler interface.**

```ts
type Handler = {
    read:      (dwrl, ctx) => unknown;
    write:     (dwrl, v, ctx) => void;
    subscribe: (dwrl, cb, ctx) => Off;
};
```

- **`DEFAULT_HANDLER`** — state-channel. `read` and `write` route through
  the appropriate state and `put()` (the wrapper's, or the row's identity-
  keyed update for `./relative` paths in a list row). `subscribe` wraps
  the framework's `subscribe()` primitive against the matching station.
  Reactive: fires on every publish.
- **`DW_PROTOCOLS` entries** — bridged via `toHandler`. `subscribe` fires
  once with `handler.read(pURL, wrapper)` and returns a no-op `Off` —
  there is no in-process pub/sub for external storage. `write` delegates
  to the handler's optional `write` (or no-op if the handler is read-only).

**Bidirectionality is gated by protocol identity, not source shape.**
Every `Source` now has a total `write`, so the writeback subscription at
`wire()` can't gate on `source.write` truthiness — every default-protocol
binding would loop (`$data-foo="/bar"` re-triggering `bar` whenever `foo`
changes). The gate is the protocol: only non-default protocols compose
the writeback subscription on the wrapper's matching `data-*` state
channel. A protocol handler exposing `write` lights up bidirectional
state sync; a handler that omits `write` (or registers as a bare
function) is read-once and `state` diverges from storage after wake.

The writeback uses the same `subscribe()` primitive used everywhere
else, which init-fires the sub with the current value. The init
round-trip is harmless when read and write are symmetric: the
`localstorage` protocol returns `undefined` on a missing key, and
its `write(undefined)` is `removeItem` — so the init-write on an
empty source is a no-op. This is the convention protocol handlers
should follow: **return `undefined` on miss; treat `write(undefined)`
as "clear."** A protocol that breaks either side (e.g. returns the
literal string `"null"` on miss) will see a redundant write on every
binding setup, and may even corrupt the source. Protocols with
expensive or non-idempotent writes (a future `api://` POST) should
guard internally or expose `read`-only.

**Where this shows up.**

- `$text="/name"` — default protocol, no writeback subscription.
- `$data-active="/todos?where=!done"` — computed value: default protocol,
  `bind()` routes the sink through `put()`. No writeback (default
  protocol) — the binding is one-way: `/todos` → `/active`.
- `$data-todos="localstorage://todos"` — non-default protocol with
  `write`; writeback fires on every `data-todos` change. Storage and
  state stay in lockstep automatically.
- `*list="/items"` — default protocol, consumed by the `list` directive.
- `*list="localstorage://snapshot"` — non-default protocol; the directive
  fires once with the read value. Read-once is the natural semantic
  for storage sources; reactive update from external writes requires
  a cross-tab `storage` event listener (deferred).

The seam keeps `wire()` source-agnostic. Adding `url:`, `session:`,
`api:` is a registry insert plus a handler implementation — no
`wire()` change.

## Extensibility

`DW_DIRECTIVES`, `DW_FORMATTERS`, `DW_PROTOCOLS`, and `DW_TEMPLATES`
are exported `Map`s. User code adds entries or overrides built-ins with
`Map.set()`. Last write wins. Templates declared in the document
(`<template id="…">`) take precedence over registered ones.

- `DW_DIRECTIVES` — structural directives keyed by name (`list`, `if`).
  Custom directives compile their pURL once and return a subscriber.
- `DW_FORMATTERS` — value-transform pipeline pieces. Built-ins include
  `where`, `get`, `length`, `currency`, `date`, `upper`, `lower`,
  `bool`, `onoff`, `yesno`, and more. Custom formatters land app-
  specific transforms without changing the framework.
- `DW_PROTOCOLS` — non-default protocol handlers for pURLs. Built-in:
  `localstorage`. Each handler exposes `read` and optionally `write`;
  `toHandler()` adapts these into the framework's canonical `Handler`
  interface at resolution time (see Source Resolution).
- `DW_TEMPLATES` — declared `<template id>` lookup table used by
  `data-empty="…"` and other directives that resolve a name to a
  template. Document-declared templates override registered ones.

The Map-as-registry choice trades type safety for ergonomics:
overriding `count` or `currency` is one line of app code, no
configuration object, no plugin lifecycle.

## View Loading

A wrapper with `src="<url>"` calls `load()` on connect. For `.js` /
`.mjs`, it dynamic-imports and calls `default(wrapper)`. For HTML, it
fetches, tears down the outgoing subtree (`unwake` — releasing escaped
subscriptions and `@` listeners), replaces `innerHTML`, resets the
Station and list cache, clears `_live`, and re-wakes. `dw/loaded` is
emitted on completion.

**Inline scripts opt in via `?run-scripts`.** Browsers don't execute
`<script>` tags inserted via `innerHTML`, so loaded views are inert by
default — initialize via `onload=""`, a `.js` controller, or a parent
that calls `register()`. Append `?run-scripts` to the `src` URL to opt
that view into having its inline scripts re-created and executed before
wake binds; `document.currentScript.closest('data-wrapper')` gives the
script its host wrapper. External `<script src>` is skipped — its async
fetch would race with wake's binding pass.

**Two-wake sequence.** A wrapper with `src=""` wakes twice: once on
connect (whatever children are already in markup), then again after
`load()` swaps `innerHTML`. The wrapper element itself is in *both*
walks, so any `$data-*` declarations on the wrapper fire on both
passes — once at connect time, then again after the post-load swap.
Between the two wakes, `load()` resets the Station and clears
`_live`, so subscribers re-attach fresh rather than accumulate. The
canonical pattern for a loaded view with bidirectional protocol
state — e.g. the todos showcase — relies on this: the connect-time
wake sets up the binding against an empty source (no-op writes
through `undefined`); the inline script seeds whatever defaults it
needs; the second wake picks up the seeded value.

## Lifecycle Events

The framework emits a small set on the wrapper. All bubble *except*
`load`, which is dispatched non-bubbling to match the native
`HTMLElement.onload` semantic — a nested wrapper's `load` shouldn't
re-trigger an ancestor's inline `onload=""` handler. `dw/load` is the
bubbling alias for catching descendant connects. The wrapper is
reachable via `event.target`; `detail` carries only what isn't
derivable from the dispatch context.

| Event           | Bubbles? | When                                            | `detail`                          |
| --------------- | -------- | ----------------------------------------------- | --------------------------------- |
| `load`          | no       | Wrapper connected and woken                     | `undefined`                       |
| `dw/load`       | yes      | Bubbling alias for `load`                       | `undefined`                       |
| `dw/loaded`     | yes      | `src` fetch + content swap finished             | `{ src: string }`                 |
| `dw/ready`      | yes      | Wrapper fully alive: wake + controllers done    | `undefined`                       |
| `dw/sync`       | yes      | A state key changed                             | `{ key: string }`                 |
| `dw/error`      | yes      | Load fetch failed, or a controller threw        | `{ src?: string, error: unknown }`|
| `dw/disconnect` | yes      | `disconnectedCallback` fired                    | `undefined`                       |
| `put:`          | yes      | A `put:` pURL on `@` dispatched                 | `DispatchDetail` (see @ Dispatch) |

**Picking the right event.**

- `load` / `dw/load` fire **after `wake()`** in `connectedCallback`. They
  do not wait for `dw/controller` scripts to finish — they signal "the
  wrapper's bindings are wired and the markup it had at connect time is
  alive." Use them for the lowest-latency "wrapper is here" signal,
  including inside an `onload=""` attribute that needs the native event.
- `dw/loaded` fires **after the fetch + swap** in `load()`. Specific to
  `src=""` loads; `detail.src` carries the resolved URL.
- `dw/ready` fires **after `dw/controller` scripts complete**, both at
  connect time (for inline wrappers) and after `load()` (for `src`-
  loaded). It's the symmetric "fully alive" signal — code that wants to
  wait until controllers have set up listeners and seeded state should
  listen for this one regardless of how the wrapper got its content.
  In `load()` it fires immediately after `dw/loaded`.
- `dw/sync` fires on every `put` / `patch` / `push` / `pull` /
  Proxy-set / MutationObserver-driven state change; `detail.key` is the
  affected root key.
- `dw/error` fires when load or controller execution fails.
  `detail.src` is the URL when known (load-time failure); omitted for
  connect-time controller failures. `error` is the thrown value. The
  error still propagates through `load()`'s rejection if you wanted to
  `.catch()` it directly; `dw/error` lets observers react without
  promise plumbing.
- `dw/disconnect` fires from `disconnectedCallback`. Useful for cleanup
  observers that need to release external resources tied to the
  wrapper. Bubbles, but won't reach DOM ancestors that have already
  been detached themselves (parents are gone by then).
- `put:` is auto-listened-for by every wrapper; the framework's listener
  calls `handlePut(e)` which extracts the value from the payload and
  writes through `this.put(path, value)` (absolute) or an identity-keyed
  immutable update against the parent array (`./relative` row paths).
  Users can `register({'put:': cb})` to layer additional behavior atop
  the default — both fire, in order.

`load` exists alongside `dw/load` so the browser-native inline
`onload=""` attribute fires. The framework's preferred form is
`dw/load`, but `load` is the affordance that makes one-liner
initialization in loaded views possible.

## Accepted Complexity

Some complexity serves DX and should remain:

1. `get` / `put` / `patch` / `push` / `pull` as path-aware state accessors.
2. `register()` as bulk subscription sugar with wrapper-ownership filter.
3. `_isSyncing` to suppress reflect-back loops.
4. Delegated events keep updates O(1) when DOM is added.
5. Fan-out at the publish boundary — depth lives in one place, not in
   every subscriber.

## Debugging

All debugging logic lives in `src/lib/debug.ts`, isolated from the
framework. Framework code touches it through exactly one entry point —
`record()`, called from `emit()` — so the rest of the lib stays
debug-agnostic. The browser console is the logger; this file decides
when to flush.

The constraint: **the framework should not build tools the browser
already has.** No custom log format, no DevTools panel, no
state-replay UI. If a need can be met with `console.log` plus DOM
attribute selectors plus a console handle, that's how it's met.

- **`_debug` attribute** — set on any `<data-wrapper>`, the framework
  logs every `emit()` whose ctx is at or below that wrapper through
  `console.log`. The line carries the wrapper id, the event name, and
  the original ctx and detail. DevTools' filter box does the rest.
  Lifecycle events (`load`, `dw/load`, `dw/sync`, `dw/loaded`) and
  every `@`-action go through `emit`, so all of them appear; native
  DOM events that bypass `emit` do not.
- **`window.dw`** — a thin handle for the console. `dw.all` lists
  every wrapper on the page; `dw.debug(el)` toggles `_debug` on one
  element, `dw.debug()` toggles it on every wrapper; `dw.history`
  returns the recent event buffer; `dw.clear()` empties it.
- **History buffer** — `emit()` always records the last 1000 events
  whether `_debug` is set or not. The overhead is one push + one
  bounded shift per dispatch. Flipping `_debug` on shows everything
  going forward; `dw.history` surfaces what happened *before* the flag
  was set. This is the foundation a time-travel debugger would build
  on; today it's just a ring buffer the console can read.

The underscore-prefix convention is provisional; if the namespace
moves to `data-*` later (e.g. `data-dw-debug`), it's a find-replace.

---

# Roadmap

Provisional. Spec first, code second.

## pURL — extended fields

`p()` exposes raw URL parts. Status:

- **`host`** — **shipped** for all three tokens, resolved by
  `document.getElementById`. `//id/key` retargets a binding to the
  wrapper carrying that DOM id instead of the closest ancestor:
  `$`/`*` read its state, `@` dispatches its topic onto it. The host
  must be an upgraded wrapper when wiring runs (true for ancestors);
  an unresolved host is skipped with a console warning. Host strings
  are URL hostnames, so effectively lowercase. A cross-wrapper `$`/`*`
  subscription is an *escape* (see Subscription Teardown), tracked and
  torn down; a host-`@` listener stays on the local wrapper, so it
  needs no extra teardown. One caveat: a host-`@` handler's
  `event.target` is the host wrapper, not the origin element — origin
  travels in `event.detail.originalEvent`.
- **`protocol`** — **shipped** as an extension surface via
  `DW_PROTOCOLS` and the canonical `Handler` interface. Built-ins:
  `dwrl:` (default, state-channel), `localstorage://` (storage with
  bidirectional writeback when the handler exposes `write`), and `put:`
  on `@`-tokens (write-direction protocol, auto-handled by every
  wrapper). Future: `url:`/`session:`/`api:` registered handlers,
  cross-tab reactive bridges via `storage` events, and additional
  write-direction protocols (`push:`, `pull:`, `patch:`) for array
  operations.

## pURL query-param conventions

Shipped (see Stable → pURLs → Stable query conventions): `?format=`,
the `?<formatter>=<arg>` form, the pURL-shaped arg
(`?where=/filter`), `?key=`, the boolean rule, and `@` dispatch
options. Open:

- **Compound-arg formatters** under `?format=name`: `?format=date:short`,
  `?format=currency:EUR`. The current `?<formatter>=<arg>` form (one
  arg) covers most needs; `?format=name:arg` would be a parallel shape
  for callers that prefer the `format=` prefix.
- **Custom user options.** The query string is currently
  framework-reserved on every token. Opening it to user-defined params
  would need a discrimination rule (prefix? explicit allowlist?).

## `@` dispatch — deferred options

Stable: `prevent`, `stop`, `immediate`. Tentative:

- `once` — remove the listener after one dispatch.
- `capture` — listen in the capture phase (for `focus`/`blur`).

## `@` payload modes

Stable default (shipped): element-aware harvest. For `<form>`
actionTargets, iterate `el.elements`, harvest each named control via
type-appropriate accessor (`el.checked` for checkbox, array for
`<select multiple>`, `el.value` otherwise). For single elements,
`{name: value}` from the actionTarget. Unchecked checkboxes contribute
`false`, not omission (form-submit's presence-as-truth is wrong for
live state).

Future opt-in modes via `?payload=`:

- `?payload=subtree` — collect named controls from the actionTarget's
  subtree even when it isn't a `<form>`.
- `?payload=scope` — collect from the closest form-like ancestor.
- `?payload=none` — explicit empty payload (skip harvest entirely).
- `?payload=formdata` — opt back into legacy FormData semantics for
  the rare case where presence-as-truth is actually wanted.

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

## Progressive Web App

Site-level, not library — `src/lib` is unaffected.

Every page references `/site.webmanifest`. The manifest now exists
(name, theme colour, icon slots), so the console stays clean and "Add
to Home Screen" carries real metadata. Outstanding before the site is
a true installable PWA:

- **Icons** — the manifest references `icon-192.png` and
  `icon-512.png`, which don't exist yet. The install prompt is gated
  on them.
- **Service worker** — no offline support or installability.
  Deferred deliberately: a cache layer between edits and users is a
  foot-gun while the site is still iterating. Revisit once it
  stabilises. When built, it should be a no-build worker on the native
  `ServiceWorker` API — a zero-dependency framework warrants nothing
  less.

---

## Deferred Polish

Known limitations and unbuilt internals, each tied to a real motivation
(not speculative scope). They live here, not in the core, until dogfood
proves they're earned.

**Cycle detection in `$data-*` declarations.** A circular graph
either stabilises via the `prev === next` short-circuit on primitive
values, or stack-overflows on object values. v1 leaves it to runtime;
the named cycle path (`b → c → b`) ships as a development-only
diagnostic, likely in the debugger module rather than the core.

**Batched flush / diamond dedup.** A binding bound to two channels
via formatter arguments re-fires on each input change. No v1
built-in formatter consumes two pURL args, so the diamond shape
can't appear in user code yet. Ships when the first custom
formatter combines channels.

**Wake-time topological order for initial values.** Out-of-order
`$data-*` declarations cost one redundant initial write. Eventually
consistent. Cheaper to ship topo sort when dogfood reveals the
extra write actually matters than to assume it will.

**Multi-channel subscription per binding.** `$text="/todos?where=/filter"`
currently subscribes only to `/todos`; the `/filter` arg is
re-resolved on `/todos` fires but the binding doesn't itself listen
to `/filter`. Pre-existing limitation, not specific to `$data-*`.
Adding it tangles with row-scope rules (`./` resolves against
`row.subs`, `/` against `wrapper._subs` — one binding straddling
both). Designed once with dogfood evidence.

**Richer `where` predicate language.** v1 grammar is `!field`,
`field`, `field=value` (JSON-parsed RHS). Comparisons, boolean
compositions, nested paths, IN clauses — extended in Stage 5 polish
or via custom formatters per app, depending on how often the same
shapes appear across demos.

**Address-bar sync, `_` token implementation, PWA service worker** —
each scoped in the sections above; none on the v1 path.

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
