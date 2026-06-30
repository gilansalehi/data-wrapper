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

## Non-Goals

- No behavioral changes; surface polish and test/docs hygiene only.
- Anything with architectural impact gets its own ticket.

## Acceptance

- `bun test` stays green and `bun run build` clean after each drained item.
