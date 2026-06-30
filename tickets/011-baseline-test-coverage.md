# Ticket 011: Baseline Test Coverage

## Goal

Establish a minimum unit-test suite for the lib's public contract before 1.0
ships.

## Rationale

The lib now has an initial contract suite, added during the component-module
pivot and ticket 004 work. Coverage was deliberately deferred while the surface
was unstable; with the binding context chain landed, the remaining work is to
round out the public contract without pinning private implementation details.

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
  - bare-name lookup climbs row scopes before the component runtime
  - `./key` reads from row item inside `*list`
  - `/key` reads the component/root scope and bypasses rows
  - nested `./key` resolves to the innermost row (the RFC's orders example)
  - bare/`./` misses render a static literal and warn without aborting siblings
  - removing a row tears down its nested list caches
  - `*if` truthy/falsy toggle adds/removes DOM
  - child-wrapper `src` inputs reach the factory as `context.props`
  - nested child wrappers load with the parent's binding context at the mount
    point
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
- No full browser round-trip tests for the loader (`fetch`, import-map
  injection, blob URL paths) — these depend on browser behavior happy-dom
  doesn't fully model.

## Acceptance

- `bun test` runs cleanly with the baseline suite present.
- Each public contract item above has at least one test.
- Tests exercise the engine directly (constructing `ComponentRuntime` +
  calling `wake(wrapper, rootContext(wrapper))`) rather than going through
  `load()`, except for narrow child-input tests that stub browser boundaries
  without asserting loader internals.
- A failing test fails for a clearly named reason (no opaque assertion
  errors).
