# Ticket 000: Minor Quibbles

## Goal

Track small, non-blocking follow-ups that are worth doing eventually, but not
worth turning into full feature tickets. Completed ticket notes should live in
git history, not in this file.

## Items

### 1. De-duplicate test helpers

`mount`, `wrapperWithRuntime`, `structuralTemplate`, and similar helpers are
redefined across several contract-test files. Extract the shared harness pieces
into `tests/helpers.ts` once the test shapes settle.

### 2. Generate more technical-info data

`bun report` already keeps the size view current. Later, feed
`site/views/info/` with generated package metadata and public-export data too,
so the technical info page cannot drift from the package surface.

### 3. Dist smoke tests

Add a small browser smoke fixture that loads both published artifacts:
`dist/data-wrapper.js` as ESM and `dist/data-wrapper.min.js` as the classic
script artifact, then renders a minimal `<data-wrapper>` view through each one.

### 4. Built-dist example audit

Before public beta, verify that public examples run against the current
`dist/` build, not only `src/lib` through the test harness.

### 5. npm publish provenance

When ticket 014 reaches its publish step: enable npm 2FA on the publishing
account and publish with `--provenance` so the registry links the package to
its source commit. Closes the publish-side supply chain; zero code change.

### 6. View-path allowlist — decision parked

A configurable path-prefix restriction for view loading (e.g. views only
under `/views/`) was considered during the security review and parked:
ticket 021's documentation covers the realistic risk (user uploads on the
app origin), and config surface needs dogfood-proven demand. Revisit only if
a real adopter hits the uploads-origin problem.

### 7. Homepage ↔ tutorials duplication — direction ratified, refactor deferred

The user's call (2026-07-09): the industry shape is homepage = splashy CTAs /
social proof, tutorials page = the teaching walk. Today the homepage steps
(01–03 etc.) duplicate much of /tutorials. Not ready for the large-scale
refactor; detail passes are landing meanwhile (steps 01/02 now use the
`.pitch__code` titled slab; `counter.v2.html` simplified to `plus`/`minus`
with two style rules). When the big pass happens: homepage keeps the hero +
one taste of the product + CTAs; the step-by-step content consolidates into
/tutorials.

## Non-Goals

- No behavioral changes.
- No architectural work; anything larger gets its own ticket.
- No completed-ticket history.

## Acceptance

- The file contains only live follow-ups.
- `bun run review` stays green after each drained item.
