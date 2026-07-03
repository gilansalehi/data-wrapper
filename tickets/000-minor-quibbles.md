# Ticket 000: Minor Quibbles

## Goal

A living collection of small, non-blocking code-quality follow-ups that surface
during review of larger tickets. Each is a few lines, narrowly scoped, with no
architectural impact. Drain items as convenient; add new ones as we hit them.

## Items

### 1. De-duplicate test helpers

`mount` / `wrapperWithRuntime` / `structuralTemplate` / `el` / `template` are
redefined across `tests/core.test.ts`, `tests/scopes.test.ts`, and
`tests/inputs.test.ts`. Extract the shared ones into a single `tests/helpers.ts`
so the harness has one source of truth. (From ticket 004 review.)

### 2. Public API surface follow-up

`src/lib/index.ts` now exports the intentional authoring surface instead of the
whole internal runtime. Keep docs and examples aligned with that surface:
`action`, `flush`, `DW_DIRECTIVES`, `DW_FORMATTERS`, directive/formatter/factory
types, and the small helpers we explicitly support (`p`, `pURL`, `on`, `emit`,
and `q`). If TypeScript declarations ship later, revisit which public types are
worth freezing.

### 3. Keep the technical info page generated/current

The first public technical info page exists at `info.html`, with small views in
`views/info/` for package metadata, download size, browser compatibility, public
API surface, and release checks. The page is currently hand-maintained and
accurate enough for the beta prep pass. Follow up by feeding it generated
package, export, and size data instead of manually maintained snapshots.

### 4. Repeatable size report

Add a command or script that reports raw and gzip sizes for
`dist/data-wrapper.js` and `dist/data-wrapper.min.js`. The info page can then
use the generated numbers instead of a manually updated snapshot. This is also
tracked as the first practical step in ticket 015.

### 5. Dist smoke tests

Add a small smoke-test fixture that loads both published artifacts:
`dist/data-wrapper.js` as ESM and `dist/data-wrapper.min.js` as a classic script
or IIFE artifact, then renders a minimal `<data-wrapper>` view.

### 6. Built-dist example audit

Before public beta, verify that public examples run against the current
`dist/` build, not only `src/lib` through the test harness.

### 7. Lifecycle events / post-wake DOM setup

The current lifecycle is intentionally small: the default factory is setup, and
`context.cleanup()` is teardown. If a real component needs post-wake DOM setup
for a chart, editor, observer, canvas, or third-party widget, explore a DOM-side
lifecycle event such as `@wake` / `@dw:wake` instead of expanding the factory
context. The design needs to answer event naming, row-local cleanup, and whether
the event fires once per created node or on every re-wake.

### 8. Explicit controlled-input examples

Controlled inputs already work with ordinary tokens, for example
`<input @input="setValue" $value="value">`. Add a small docs example before
inventing a shorthand such as `*bind`; a shorthand should wait until repeated
real usage proves the boilerplate is worth the extra API.

## Non-Goals

- No behavioral changes; surface polish and test/docs hygiene only.
- Anything with architectural impact gets its own ticket.

## Acceptance

- `bun test` stays green and `bun run build` clean after each drained item.
