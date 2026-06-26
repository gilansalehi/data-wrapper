# Ticket 000: Minor Quibbles

## Goal

Collect small, non-blocking code-quality follow-ups that surface during code
review of larger tickets. Each item should be a few lines of change, narrowly
scoped, with no architectural impact.

## Rationale

Some review notes are too small to warrant their own ticket but valuable to
track in one place. Folding them into this ticket lets a reviewer pick them up
in a single pass without spawning ticket sprawl.

## Items

### 1. Simplify reconcile cursor check

`engine.ts reconcile()` currently gates the in-place move with two conditions:

```ts
if (row.node !== cursor && row.node.nextSibling !== cursor)
    container.insertBefore(row.node, cursor);
```

The second condition appears redundant — no case I traced fires the
`row.node.nextSibling === cursor` branch except when `row.node === cursor`
already shortcuts the first. In one edge case it introduces a latent bug:
when `cursor === null` and a freshly cloned row has no trailing sibling in
its template fragment (compact `<template><x/></template>` with no
whitespace inside or around), `row.node.nextSibling` is also `null`, the
condition is `null !== null` → false, and the insert is skipped — the new
row never lands in the DOM.

In practice the bug is masked because typical hand-authored templates carry
whitespace text nodes around their root element. A minifier that strips
whitespace would surface it silently.

**Change:** drop the second condition.

```ts
if (row.node !== cursor)
    container.insertBefore(row.node, cursor);
```

### 2. Document cleanup ordering in `disconnectedCallback`

`element.ts DataWrapper.disconnectedCallback()` calls `unwake(this)` before
`this._component?.destroy()`. That ordering means factory cleanups (registered
via `ctx.cleanup(off)` per ticket 003) run before component runtime teardown
— but the dependency is implicit.

**Change:** add a one-line comment above the deferred-teardown block noting
that factory cleanups run before component destroy. Roughly:

```ts
// unwake first so factory cleanups (registered via ctx.cleanup) run before
// the component runtime tears down — actions can still flush state during
// cleanup if needed.
unwake(this);
this._component?.destroy();
```

### 3. Note async-reload window in `connectedCallback`

When a wrapper's `src` changes dynamically, the old component runtime and
subscriptions stay alive during the new `load()`'s fetch window, then get
swapped during `load()`'s internal `unwake` + `destroy` call. Not a bug —
the old subs are torn down properly when the new view lands — but worth a
short comment so a future reader doesn't try to "fix" it by tearing down
eagerly (which would break move-safety).

**Change:** one-line comment in `connectedCallback`'s `_loadedSrc` check.

## Non-Goals

- No behavioral change beyond item 1.
- No new tests; these are surface polish.
- No expansion of this ticket once it's drained — new quibbles go in a fresh
  ticket once this one is done.

## Acceptance

- `bun typecheck` and `bun run build` clean.
- The orders showcase still renders, reorders, and removes rows correctly.
- A view written with a compact `<template><li>…</li></template>` (no
  whitespace) still renders its first row.
- Code review can find the cleanup-ordering and async-reload comments at
  the spots they describe.
