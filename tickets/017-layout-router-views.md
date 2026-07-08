# Ticket 017: Layout / router views via bound `$src`

## Status

**Superseded by ticket 019 (`*src` directive)** — ratified 2026-07-08.

`*src` delivers the same layout/router capability but resolves the source in the
correct context and creates the child wrapper explicitly, so it (a) avoids the
`connectedCallback` self-wake bug this approach requires a fix for, and (b)
re-loads reactively instead of initial-load-only. The verified bug analysis and
probe below are kept for reference; the capability lands in 019.

## Problem

`framework.html` and `info.html` duplicate the page body scaffold: the nav
wrapper, the `<main>` / `<aside>` / `<article>` shell, and the aside heading. We
want a **no-build** way to define that scaffold once and let each page supply only
its unique parts — without a build step and without inventing a layout DSL.

The earlier direction (light-DOM `<slot>` projection) was rejected: real `<slot>`
requires Shadow DOM, which encapsulates styles and breaks the shared-CSS
light-DOM model; using `<slot>` as an inert light-DOM marker repurposes a spec
element. (Full reasoning in `collab.md` history.)

## Design: a layout is just a wrapper that loads child views by bound src

No new concept. A "layout" is a normal component view whose outlets are child
`<data-wrapper>`s with their `src` **bound** to a prop, and the prop comes from a
URL param.

Host page (now thin):

```html
<!-- framework.html <body> -->
<data-wrapper src="/views/layout/docs.html?title=Framework&toc=/views/toc/framework.html&view=/views/page/framework.html"></data-wrapper>
```

Layout view (shared scaffold, defined once):

```html
<script type="module" data-module="@layout/docs">
export default ({ props }) => ({ title: props.title, toc: props.toc, view: props.view });
</script>

<data-wrapper id="nav" src="/views/nav.html" $data-nav-open="open"></data-wrapper>

<main class="container with-sidebar">
    <aside class="docs-toc">
        <h1 $text="title"></h1>
        <data-wrapper $src="toc"></data-wrapper>
    </aside>
    <article class="docs-content">
        <data-wrapper $src="view"></data-wrapper>
    </article>
</main>
```

This is `src` + the `$` binding + typed params — all already shipped. Content
enters through existing param + binding-context rules. No slots, no projection, no
scoping divergence, no new directive. Collapse-don't-bolt-on: layout is a
composition, not a feature.

## Verified gap: this needs one small lib change (not zero)

Codex expected no lib change ("`wake()` wires `$src` before `loadChildWrapper`").
A probe proved otherwise — the child never loads:

- A src-less nested `<data-wrapper $src="view">` fires `connectedCallback` on
  insertion. With no static `src`, it takes the `else wake(this,
  rootContext(this))` branch (`element.ts:203`) and **self-wakes in its own empty
  context**: `$src` resolves `view` against nothing → falls back to the literal
  string `"view"`, sets `src="view"`, and marks the node `_live`.
- The layout's own wake (`element.ts:291`) then reaches the node but skips it —
  `engine.ts:532` `if (el.hasAttribute(LIVE)) continue`, *before*
  `loadChildWrapper`. So the child is never loaded in the layout's context.

Probe output: `src="view"` (literal), `_live=true`, child body absent, plus the
`unresolved binding "view" rendered as a static literal` warning.

### Fix (minimal, targeted)

A nested wrapper that *binds* its src (`$src`) is a loader routed by the parent's
context, not an inline component. Defer it to the parent wake:

```ts
// element.ts connectedCallback — the else (no static src) branch
if (this.hasAttribute('$src') && isNestedWrapper(this)) return; // parent wake wires $src, then loadChildWrapper()s it
wake(this, rootContext(this), load);
```

The parent (layout) wake then wires `$src` in the layout's `rootContext` (where
`view` exists) → sets `src` to the resolved URL → `loadChildWrapper` loads it.
Deferring **only** the `$src`-nested case preserves the existing inline-wrapper
behavior (a src-less nested wrapper with static children still self-wakes), and a
top-level `$src` is unaffected (no parent scope to resolve against anyway).

## Scope & non-goals

- **Body/content layout only.** `<head>` (title tag, canonical, OG, import map,
  theme script, stylesheet, dist script) stays per-page — no document templating,
  no build step.
- **No dynamic re-routing.** `$src` is honored at initial wake; changing
  `src`/`$src` later does **not** reload (no `attributeChangedCallback`). Document
  this boundary honestly; revisit only if a real need appears (→ `roadmap.md`).
- **Not slot projection** — that direction is closed.

## Open decisions to ratify

1. **File shape.** Separate `toc` + `view` child-view files per page (Codex's
   lean; I agree) vs. a single combined view. Separate keeps each file plain HTML
   and lets the nav mirror read the real TOC DOM. Honest tradeoff: for these two
   pages the *file count rises* (thin host + toc file + body file + one shared
   layout), but the scaffold is defined once and the layout becomes a reusable
   primitive. Accept the trade?
2. **Param names.** `title` / `toc` / `view` — fine, or prefer
   `heading` / `nav` / `body`?
3. **Fix shape.** The targeted `$src`-defer above vs. a broader `connectedCallback`
   restructure. I favor targeted (smallest correct diff).

## Tests (contract-level, through `load()`)

- Bound `$src` nested wrapper loads the child, resolved in the **layout's**
  context (the probe, formalized — currently red, green after the fix).
- Regression: a src-less nested wrapper **without** `$src` still self-wakes its
  inline children (don't break inline wrappers).
- A bound `$src` that can't resolve falls back cleanly (no crash).

## Docs (documentation-first)

- A doc view showing the layout pattern and the "initial wake only" boundary.
- `framework.html` / `info.html` migrated to the shared layout as the live dogfood
  demo, using `.with-sidebar` (**not** `.docs-layout`, which is being retired with
  the `structure.css` work).

## Acceptance

- [ ] Probe formalized as a green contract test after the fix.
- [ ] Inline-wrapper regression test green; full `bun review` green.
- [ ] `framework.html` + `info.html` render via the shared layout with no visible
  change.
- [ ] Doc view true, including the no-reload boundary.
- [ ] Size within the ticket 015 budget.

## Rotation

Codex implements the `element.ts` fix + layout/page view files; I write the
contract tests + doc view + the page migration. Or swap — ratify in `collab.md`.
