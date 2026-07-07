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

### 2. Keep public API docs aligned with exports

`src/lib/index.ts` should remain the intentional authoring surface:
`action`, `flush`, `DW_DIRECTIVES`, `DW_FORMATTERS`, public directive,
formatter, and factory types, plus the supported helpers `p`, `pURL`, `on`,
`emit`, and `q`. If TypeScript declarations ship later, revisit which public
types are stable enough to freeze.

### 3. Generate more technical-info data

`bun report` already keeps the size view current. Later, feed
`site/views/info/` with generated package metadata and public-export data too,
so the technical info page cannot drift from the package surface.

### 4. Dist smoke tests

Add a small browser smoke fixture that loads both published artifacts:
`dist/data-wrapper.js` as ESM and `dist/data-wrapper.min.js` as the classic
script artifact, then renders a minimal `<data-wrapper>` view through each one.

### 5. Built-dist example audit

Before public beta, verify that public examples run against the current
`dist/` build, not only `src/lib` through the test harness.

## Non-Goals

- No behavioral changes.
- No architectural work; anything larger gets its own ticket.
- No completed-ticket history.

## Acceptance

- The file contains only live follow-ups.
- `bun run review` stays green after each drained item.
