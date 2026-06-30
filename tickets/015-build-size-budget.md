# Ticket 015: Build Size Budget and Trim Pass

## Goal

Keep the production package small and intentional before 1.0, with explicit
size budgets and a focused trim pass over `src/lib`.

## Baseline

Current build after ticket 008:

```txt
dist/data-wrapper.js       23,083 bytes
dist/data-wrapper.min.js   13,262 bytes
dist/data-wrapper.min.js    5,544 bytes gzip
```

`src/lib` is about 1,039 lines total, with most weight in:

```txt
engine.ts      binding, wake, directives, scope resolution
element.ts     loader, import-map/shim path, props
component.ts   runtime, action/flush
```

## Size Budgets

Use two budgets: a near-term budget for polish work before ticket 009, and a
final 1.0 budget after cross-wrapper communication lands.

### Pre-009 budget

```txt
ESM raw       <= 24 KB
IIFE min raw  <= 14 KB
IIFE min gzip <= 6 KB
```

This is a guardrail, not a target to spend. New polish tickets should stay under
it unless there is a clear DX or correctness reason.

### 1.0 budget after ticket 009

```txt
ESM raw       <= 30 KB
IIFE min raw  <= 17 KB
IIFE min gzip <= 7 KB
```

If ticket 009 is smaller than expected, tighten these numbers before release.

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
  1.0, or whether one is a docs/CDN convenience artifact.

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
- Production output is at or below the pre-009 budget.
- Any size reductions are explained in terms of simpler code or removed
  non-contract surface, not arbitrary golf.
- Final 1.0 release prep revisits the budget after ticket 009.
