# Ticket 011: Baseline Test Coverage

## Goal

Establish a minimum unit-test suite for the lib's public contract before 1.0
ships.

## Rationale

The lib currently has zero automated tests. Coverage was deliberately deferred
during the component-module pivot because tests against an unstable surface
become churn. With the binding context chain landed and the architecture
stabilized, that justification has expired.

A 1.0 release means breaking changes carry a cost. The baseline suite makes
the next refactor catch its own regressions instead of relying on manual
verification through the showcase pages.

## Scope

- Set up `bun test` + `@happy-dom/global-registrator` (both already in
  devDependencies).
- Add `bunfig.toml` with `preload = ["./tests/setup.ts"]`.
- Add `"test"` to `package.json` scripts.
- Write tests for the public contract that 1.0 commits to:
  - bare-name binding reads from component module
  - factory instance shadows module exports
  - `./key` reads from row item inside `*list`
  - nested `./key` resolves to the innermost row (the RFC's orders example)
  - removing a row tears down its nested list caches
  - `*if` truthy/falsy toggle adds/removes DOM
  - `@event` dispatches with `detail.item` from the nearest row
  - `?prevent` / `?stop` / `?immediate` event modifiers work
  - `action()` wraps a single function; calls flush after return
  - `action()` wraps an object; each key wrapped independently
  - `action(action(fn))` is idempotent
  - imported `action`-wrapped writer triggers cross-runtime flush

## Non-Goals

- No e2e tests (Playwright).
- No visual regression / snapshot tests.
- No coverage threshold enforcement.
- No CI configuration.
- No tests for the loader (`load()`, import-map injection, blob URL paths)
  — these depend on browser behavior happy-dom doesn't fully model.

## Acceptance

- `bun test` runs cleanly with the baseline suite present.
- Each public contract item above has at least one test.
- Tests exercise the engine directly (constructing `ComponentRuntime` +
  calling `wake(wrapper, rootContext(wrapper))`) rather than going through
  `load()`.
- A failing test fails for a clearly named reason (no opaque assertion
  errors).
