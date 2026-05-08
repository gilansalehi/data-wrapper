# data-wrapper framework notes

This project treats the browser as the framework. The core loop is native DOM
attributes, native events, and native custom elements with a small amount of
registration code around them.

## Core primitives

1. `wake(root)` scans DOM that should become reactive.
2. `wire(el, attr, itemNode?)` wires one tokenized attribute.
3. `_watch(path, effect)` stores state-driven update functions by state key.
4. `_routeEvent(eventName)` stores delegated event routing by native event type.
5. `on(type, fn, delegate?, target?)` is the native event-listener helper.
6. `emit(type, detail?, target?)` dispatches a bubbling `CustomEvent`.
7. `register(actions)` is bulk `on()` for action-topic handlers.

## Wake cycle

When a `<data-wrapper>` connects:

1. It starts observing its own `data-*` attributes.
2. It calls `wake(this)`.
3. `wake()` walks the subtree, skipping nested wrappers, templates, and SVG.
4. Each tokenized attribute is passed to `wire()`.
5. Existing `data-*` state keys are broadcast once for initial render.
6. Native `load` and `data-wrapper:load` events are emitted.
7. If `src` is present, HTML or module loading runs after connection.

## State update cycle

For `$` and `*` attributes:

1. `wire()` parses the DWRL path using `new URL()`.
2. Wrapper-root bindings compile to update functions in `_subs[path]` through
   `_watch(path, effect)`.
3. Item-scoped bindings in list templates compile to update functions on the
   item node instead of entering wrapper state subscriptions.
4. `put()`, `patch()`, `push()`, `pull()`, or external `dataset` mutation calls
   `_broadcast(key, value)`.
5. `_broadcast()` only calls effects registered for that key.

This is the O(1)-by-key update path: a state key update only visits subscribers
for that key. Attribute parsing, formatter setup, and directive/binding routing
happen once during wake, not on every update.

## Event cycle

For `@` attributes:

1. `wire()` extracts the native event name, such as `click` from `@click`.
2. The owning wrapper calls `_routeEvent(eventName)`.
3. `_routeEvent()` installs at most one delegated native listener for that event
   type on the wrapper.
4. When the native event bubbles, the delegated listener finds the element
   carrying the matching `@event` attribute.
5. The attribute value is emitted as a bubbling action-topic `CustomEvent` from
   the element carrying the `@event` attribute.
6. `register()` handlers receive that topic event via normal DOM event
   listening.

The event path intentionally preserves browser bubbling. `register()` catches
action topics on the wrapper because they bubble up from the declaring element.
The wrapper ownership check only prevents a parent wrapper from routing an
`@` attribute that belongs to a nested child wrapper.

## Lists

The list directive reconciles keyed DOM nodes from a native `<template>`.
New nodes are woken with their item node and owning wrapper. That keeps all
tokenized attribute wiring under `wake()`/`wire()` instead of requiring a second
template-only event scan.
Item updates re-run the compiled item effects stored on the keyed node.

## Design pressure

Keep the helper surface small:

1. Prefer browser-native concepts over framework-specific registries.
2. Keep `emit()` and `on()` thin.
3. Keep `register()` as convenience over `on()`, not a separate event system.
4. Keep event delegation as an implementation detail of `_routeEvent()`.
5. Keep tokenized attribute wiring centralized in `wire()`.
6. Let `wire()` infer token kind from the attribute name.
