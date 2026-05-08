# data-wrapper framework notes

`data-wrapper` treats the browser as the framework. HTML declares data
relationships with attributes; the custom element owns the data, subscriptions,
list caches, and event routing.

## Core Rule

The DOM is declarative. `data-wrapper` owns the logic.

DOM nodes hold attributes and rendered output. Runtime framework state lives on
the wrapper: wrapper state, root subscriptions, list row caches, row
subscriptions, and delegated event registrations.

Framework-owned DOM markers use underscore-prefixed attributes. They are visible
debugging flags, not subscription storage.

## Render Lifecycle

1. `<data-wrapper>` connects.
2. The wrapper observes its own `data-*` attributes.
3. The wrapper calls `wake(this)`.
4. `wake()` scans the wrapper subtree with a `TreeWalker`.
5. Nested wrappers, templates, and SVG are skipped.
6. Each element is tagged with `_live` and each attribute is passed to `wire()`.
7. `wire()` ignores normal HTML attributes and handles only `$`, `*`, and `@`.

## Wiring

`wire()` compiles attributes once. Runtime updates should not parse attributes,
query templates, or rebuild binding logic.

For `$` bindings:

1. `wire()` parses the DWRL value with `new URL()`.
2. Formatters are compiled into a `format(value)` closure.
3. `bind(el, prop)` compiles a DOM update subscriber.
4. Wrapper-scoped paths register with `wrapper._watch(path, sub)`.
5. Item-scoped paths register with `watch(row.subs, sub, row.item)`.

For `*` directives:

1. `wire()` parses the DWRL value and resolves the directive.
2. The directive is called once at wake time.
3. The directive returns a subscriber closure.
4. `wrapper._watch(path, sub)` stores that closure by state key.
5. Item-scoped directives inside rows store their subscriber in `row.subs`.

For `@` events:

1. `wire()` extracts the native event name.
2. The wrapper installs one delegated listener for that event type.
3. Native browser bubbling carries the event to the wrapper.
4. The delegated listener emits the action topic named in the `@event`
   attribute from the declaring element.

## Subscriptions

The framework has one update primitive: a subscriber.

```ts
type Sub<T = unknown> = (value: T) => void;
type Subs<T = unknown> = Sub<T>[];
```

Wrapper state subscriptions are keyed by state path:

```ts
_subs: Record<string, Subs>
```

List row subscriptions are keyed by row identity inside wrapper-owned list
caches:

```ts
_listCache: Map<Element, Map<unknown, Row>>
Row = { node, item, subs }
```

The shared wrapper shape owns both subscription systems:

```ts
Wrapper = HTMLElement & { state, _subs, _listCache, _watch, _routeEvent }
```

`watch(subs, sub, value)` stores a subscriber and immediately runs it for
initial render. `broadcast(subs, value)` only calls stored subscribers.

## State Updates

`put()`, `patch()`, `push()`, and `pull()` all converge on `put()`.

1. `put()` computes the next value.
2. `state[key] = next` writes through the Proxy into `dataset`.
3. The Proxy serializes objects to JSON and strings everything else.
4. `_isSyncing` suppresses the MutationObserver echo from internal writes.
5. `_broadcast(key, value)` calls subscribers for that key.
6. `data:sync` is emitted for app-level derived state and integrations.

External `data-*` mutations use the MutationObserver path:

1. The observer sees a `data-*` attribute change.
2. The changed attribute name is converted to a dataset key.
3. The wrapper reads `state[key]`, including JSON parsing.
4. `_broadcast(key, value)` updates subscribers for that key.

## Lists

`*list` is a compiled directive.

At wake time the directive captures:

1. The list element.
2. The direct child `<template>`.
3. The wrapper-owned cache for that list element.
4. The `wake()` function used for inserted DOM.
5. The row identity key.
6. The current empty-state node reference, if any.

At update time the list subscriber owns list-level state:

1. Empty lists clear row DOM and row cache.
2. Empty lists render the configured `data-empty` template once.
3. Generated empty-state nodes are tagged with `_empty`.
4. Generated empty-state nodes are woken with no row.
5. Non-empty lists remove the empty-state node and call `reconcile()`.

`reconcile()`:

1. Reuses existing rows by identity.
2. Creates new rows as `{ node, item, subs: [] }`.
3. Broadcasts updated item values to existing row subscribers.
4. Removes stale rows from the DOM and cache.
5. Appends rows through a `DocumentFragment`.
6. Wakes new row nodes after insertion so `wake()` can use DOM ancestry.

This keeps row logic inside the wrapper-owned cache. The DOM node is rendered
output; the row record is the framework state.

## Architecture Target

The ideal render path is:

1. `wake()` compiles attributes into subscribers.
2. The wrapper stores subscribers in root state buckets and list row buckets.
3. Updates broadcast values into already-compiled subscribers.
4. Lists reconcile row identity, then broadcast item values.

No runtime update should re-parse attributes, rebuild formatter chains, recreate
DOM binding logic, or store framework subscriptions directly on rendered DOM
nodes.

## Accepted Complexity

Some complexity serves the developer experience and should remain:

1. `put()`, `patch()`, `push()`, and `pull()` as ergonomic mutation helpers.
2. `register()` as bulk event subscription sugar.
3. `_isSyncing` to preserve attribute reflection without update loops.
4. Delegated events to keep updates O(1) when DOM nodes are added.

## Pressure Points

Use these as future simplification checks:

1. Can this work be compiled during `wake()`?
2. Can this update become a subscriber call?
3. Does this state belong to the wrapper instead of a DOM node?
4. Is this helper expressing a real framework concept, or just renaming one
   line of JavaScript?
5. Is this complexity improving DX, or protecting the framework from its own
   abstraction?
