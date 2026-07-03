# Ticket 015: Build Size Budget and Trim Pass

## Goal

Keep the production package small and intentional before public beta, with
explicit size budgets and a focused trim pass over `src/lib`.

## Baseline

Current build after tickets 004-013:

```txt
dist/data-wrapper.js       27,827 bytes
dist/data-wrapper.min.js   15,992 bytes
dist/data-wrapper.min.js    6,491 bytes gzip
```

`src/lib` is about 1,197 lines total, with most weight in:

```txt
engine.ts      binding, wake, directives, scope resolution
element.ts     loader, import-map/shim path, props
component.ts   runtime, action/flush
```

## Size Budgets

Use the public beta budget as the release guardrail. The stretch targets remain
useful pressure, but should not make the source obscure.

### Public beta budget

```txt
ESM raw       <= 30 KB
IIFE min raw  <= 17 KB
IIFE min gzip <= 7 KB
```

This is a guardrail, not a target to spend. Polish work should stay under it
unless there is a clear DX or correctness reason.

### Stretch targets

```txt
ESM raw       <= 20 KB
IIFE min raw  <= 12 KB
IIFE min gzip <= 5 KB
```

Treat these as useful pressure, not a reason to make the source obscure.

## Scope

- Add a repeatable size-report command or script that prints raw and gzip sizes
  for both dist files.
- Audit public exports and remove any accidental non-contract exports.
- Remove dead branches, stale comments that imply code paths, and unused helper
  surface.
- Look for places where one existing primitive can replace bespoke logic.
- Prefer structural simplification over byte-level code golf.
- Keep docs/showcase code out of the production package.

## Candidate Areas To Inspect

- `element.ts` import-map/shim path: keep the clear errors from ticket 006, but
  make sure there is no duplicate branching or repeated wrapper text.
- `engine.ts` binding resolution: make sure the `./`, `../`, bare, `/`, and
  reserved forms share classification cleanly.
- Directive API helpers after ticket 007: confirm only intentional authoring
  APIs are exported.
- `component.ts` action/flush path: preserve semantics, but check whether nested
  output bookkeeping has avoidable duplication.
- Dist formats: decide whether the package truly needs both ESM and IIFE for
  public beta, or whether one is a docs/CDN convenience artifact.

## Non-Goals

- No terser-style source obfuscation.
- No removing documented features to hit a byte number.
- No bundling `es-module-shims`.
- No dependency on a separate minifier package unless Bun's output becomes a
  clear blocker.
- No change to runtime behavior without contract tests.

## Acceptance

- `bun run review` and `bun run build` pass.
- A size report is easy to run locally and records raw + gzip sizes.
- Production output is at or below the public beta budget.
- Any size reductions are explained in terms of simpler code or removed
  non-contract surface, not arbitrary golf.
