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

### 2. Half-loaded state on a post-append `wake()` failure (ticket 005)

If `wake()` throws after `load()` has swapped in the new content — only an
unknown `*directive` typo does this — the wrapper is left partially woken with
`_loadedSrc` already set, so a reconnect won't retry. The error is loud (thrown),
so it isn't silent, and we deliberately left it unhandled (no error slop). The
one-line fix, if a dev ever hits it: set `_loadedSrc` after `wake()` succeeds.

## Non-Goals

- No behavioral changes; surface polish and test/docs hygiene only.
- Anything with architectural impact gets its own ticket.

## Acceptance

- `bun test` stays green and `bun run build` clean after each drained item.
