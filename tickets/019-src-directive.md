# Ticket 019: `*src` — the composition directive

## Status

Draft for review. **The single composition primitive.** Supersedes ticket 017
(bound-`$src` router) and ticket 018 (`*slot` projection) — both fold into this
one directive.

## Vision

No-build module composition with a minimal grammar. Three tokens (`$ @ *`), and
`*src` is the third structural directive beside `*list` and `*if` — **three
tokens, three directives**, the whole thing holds in your head.

`*src` is *the* outlet primitive: a view reserves a position and fills it from a
resolved source. The source can be **another view (by reference, a URL)** or
**authored content (by value, inline children)** — one directive, both modes.
This is deliberately one clean abstraction, not a `*src` + a future `*slot`.

## The abstraction

```html
<template *src="x">fallback</template>
```

An outlet. Resolve `x` (a normal binding expression) and fill the outlet by what
it resolves to:

- **a non-empty URL string** → load that view here (create a child
  `<data-wrapper src>` and load it), reactively;
- **authored child nodes** (content the host wrote for this outlet) → project
  them in place;
- **nothing** (`null` / `undefined` / `false` / `''`) → render the `<template>`
  body as fallback.

Text is **not** `*src`'s job — that's `$text`. So a bare string is always a view
URL. The caller fills an outlet however they like — by reference or by value —
and `*src` does the right thing.

## Authoring

**By reference** (host points outlets at view URLs via typed params):

```html
<data-wrapper src="/views/layout/docs.html?heading=Framework&view=/views/pages/framework.html"></data-wrapper>
```

**By value** (host writes content inline, targeted with the plain `slot=`
attribute we read as a grouping key):

```html
<data-wrapper src="/views/layout/docs.html?heading=Framework">
    <ol slot="toc"><li><a href="#intro">Intro</a></li></ol>
    <article>…inline body…</article>
</data-wrapper>
```

**The layout view is identical either way:**

```html
<script type="module" data-module="@layout/docs">
export default ({ props, slots }) => ({
    heading: props.heading,
    view:    props.view,   // a URL string (by reference), or undefined
    toc:     slots.toc,    // captured nodes (by value), or undefined
});
</script>

<data-wrapper id="nav" src="/views/nav.html" $data-nav-open="open"></data-wrapper>

<main class="container with-sidebar">
    <aside class="docs-toc">
        <h1 $text="heading"></h1>
        <template *src="toc"><p>No sections yet.</p></template>
    </aside>
    <article class="docs-content">
        <template *src="view"><p>No content yet.</p></template>
    </article>
</main>
```

- `*src="view"` where the host passed `?view=/url` → resolves to a URL → loads it.
- `*src="toc"` where the host wrote `<ol slot="toc">` inline → resolves to those
  nodes → projects them.
- Neither provided → the template body renders as fallback.

## Semantics

### Resolution + dispatch

`*src`'s value is an ordinary binding expression, resolved by the **same one
resolver** as `$text` / `*list` — no special "slot name" parsing. The directive
inspects the *resolved value* and dispatches:

- DOM nodes → project;
- non-empty string → load as a view URL;
- empty/nullish → fallback.

Name collisions are a dev concern — one unified namespace, one name = one thing.
If a dev supplies both an inline `slot="toc"` **and** a `?toc=` param, captured
children win (most local); we do not merge.

### How captured content enters scope

Slots reach the layout **through the factory**, like everything else: `load()`
passes a `slots` map (keyed by the host children's `slot` attribute; default key
`''`) in the factory context, and the factory returns whatever it wants as values
(`toc: slots.toc`). So `*src` stays a pure source-resolving directive with **no
resolver surgery** — the dispatch lives in the directive, not the lookup.

### Reactivity

`*src` subscribes to its source like any directive: if the source changes (e.g. a
bound view URL from reactive state), the outlet replaces its content. Captured
nodes are authored once, so they project once (their source is constant).
Consistent — reactive where the source is reactive. (If reactive replacement is
too much for pass 1, initial-load-only is acceptable; the subscription model is
the target.)

### Context

Loaded/projected content wakes in the **layout's** binding context at the outlet.
A `*src` inside a `*list` row therefore composes with row-relative inputs, exactly
like an authored `<data-wrapper src="card.html?item">`.

## Why a directive that creates/moves the child (vs a bound `$src` on a wrapper)

The bound-`$src` router (ex-ticket 017) does **not** work, verified by probe: a
src-less nested `<data-wrapper $src="view">` self-wakes in `connectedCallback`
(`element.ts:203`), resolves the binding in its own empty context to the literal
string, and marks itself `_live` — so the parent wake skips it before
`loadChildWrapper` (`engine.ts:532`). A `<template *src>` directive sidesteps this
entirely: it runs at wake, in the correct context, and creates+loads (or projects)
explicitly.

## Implementation notes

- Built-in directive on `<template>` (like `*list` / `*if`).
- **Child capture** (by-value path): during `load()`, after successful
  fetch/parse/module checks and immediately **before** clearing the wrapper (so a
  failed load stays retryable), capture the host wrapper's current child nodes
  into a `Map<string, ChildNode[]>` grouped by `slot` attribute (default `''`).
  Pass it as `slots` in the factory context.
- **By reference:** `const child = document.createElement('data-wrapper');
  child.setAttribute('src', url); insert at anchor; wake(child, ctx)` — reuses the
  existing child-wrapper load path.
- **By value:** move the captured nodes to the anchor and wake them in `ctx`.
- **Fallback:** clone the template body as a *fragment* (may be multiple top-level
  nodes — do **not** use `cloneTemplate()`, which keeps only the first) and wake.
- **Cleanup:** remove the owned child wrapper / projected nodes / fallback on
  teardown or source change; removing a child wrapper lets the existing
  `disconnectedCallback` cleanup run.
- **Move-safety:** a projected nested `<data-wrapper src>` disconnects then
  reconnects during the move — it rides the deferred-teardown reconnect guard.
  Test it.

## Scope & non-goals

- Body/content composition only. `<head>` (title, canonical, OG, import map,
  theme script, stylesheet, dist script) stays per-page — no document templating,
  no build step.
- **Not a replacement for the native `src` attribute.** `<data-wrapper src>`
  stays the load-a-view primitive; `*src` is the composition directive built on
  it. (A long-run "everything through `*src`" is a maybe, not a goal.)
- No Shadow DOM, no literal `<slot>` elements. The host uses the plain
  `slot="name"` attribute only as a grouping key we read.

## Tests (contract-level, through `load()` / `wake()`)

- By reference: `*src` loads a view from a resolved URL param, in the layout ctx.
- By value: `*src` projects inline authored children targeted by `slot=`.
- Fallback renders when the source is missing/empty.
- Loaded/projected content wakes bindings + nested wrappers in the layout ctx.
- A `*src` outlet inside `*list` receives the row context.
- Reactive: changing a bound URL source replaces the loaded view (if reactive
  ships in pass 1).
- Move-safety: a projected nested `<data-wrapper src>` loads correctly after the
  move.
- Cleanup: replacing/removing an outlet tears down the previous child.

## Docs (documentation-first)

- A docs section framing `*src` as **the** composition outlet: "reserve a
  position, fill it from a source — another view by URL, or authored children by
  value; the template body is fallback." Note it's distinct from `$src` (a
  property binding) and from the native `src` attribute (the primitive).
- Migrate `framework.html` / `info.html` to the shared layout as the live dogfood
  demo, using `.with-sidebar`.

## Acceptance

- One directive, `*src`, handles both by-reference (URL) and by-value (inline
  children) with template-body fallback.
- `framework.html` and `info.html` share a visible scaffold with no build step.
- `bun run review` passes; size within the ticket 015 budget.

## Rotation

Codex implements the directive + capture; Claude writes the contract tests, the
doc view, and the page migration. Or swap — ratify in `collab.md`.
