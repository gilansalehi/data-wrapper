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

### 2. Public API surface audit

`src/lib/index.ts` currently re-exports every lib module. Before a public beta,
define the intentional authoring surface and stop exporting accidental internals.
Likely public exports include `action`, `flush`, `DW_DIRECTIVES`,
`DW_FORMATTERS`, directive types, formatter types, and the small set of helpers
we explicitly document.

### 3. Keep the technical info page generated/current

The first public technical info page exists at `info.html`, with small views in
`views/info/` for package metadata, download size, browser compatibility, public
API surface, and release checks. Follow up by feeding it generated package,
export, and size data instead of manually maintained snapshots.

### 4. Repeatable size report

Add a command or script that reports raw and gzip sizes for
`dist/data-wrapper.js` and `dist/data-wrapper.min.js`. The info page can then
use the generated numbers instead of a manually updated snapshot.

### 5. Dist smoke tests

Add a small smoke-test fixture that loads both published artifacts:
`dist/data-wrapper.js` as ESM and `dist/data-wrapper.min.js` as a classic script
or IIFE artifact, then renders a minimal `<data-wrapper>` view.

### 6. Built-dist example audit

Before public beta, verify that public examples run against the current
`dist/` build, not only `src/lib` through the test harness.

## Non-Goals

- No behavioral changes; surface polish and test/docs hygiene only.
- Anything with architectural impact gets its own ticket.

## Acceptance

- `bun test` stays green and `bun run build` clean after each drained item.
