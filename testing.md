# Testing

Status: **draft, current through ticket 009.** This documents *why* and
*what* we test, so the suite stays a safety net and never becomes a cage. The
harness is wired up (`bunfig.toml` + `tests/setup.ts`); the suite is being
filled in — see [Todos](#todos).

These are **contract tests, not unit tests.** Their job is to let us change
*implementation details* freely without breaking the *contract* the lib commits
to. A test that survives a behavior-preserving refactor is doing its job; one
that breaks because we renamed an internal helper is not.

## Why there are no legacy tests

The original suite was removed during the component-module pivot. Those tests
asserted the *old* design's assumptions (e.g. "bare names skip the row"), so
keeping them would have locked in functionality we deliberately walked away from.
A test that fails because the contract *changed on purpose* is noise.

We restore tests now because the core (binding-context chain, resolution,
`action`/`flush`) has stabilized. Feature work still in flight (e.g. ticket 004)
is tested **against the ticket's contract**, not against whatever implementation
currently exists — so the tests pin the spec we agreed on and leave the code free
to change underneath them.

## Ethos

- **Test the contract, not the implementation.** Assert observable behavior:
  rendered DOM, published values, "the loader was called once." Never call
  internal helpers (`resolveSource`, `formatter`, `isBareBindingPath`) or assert
  private fields (`_parentContext`, `_loadingSrc`, `_live`) — reach behavior only
  through the public surface, so internals can be refactored or deleted freely.
  If a refactor that preserves behavior breaks a test, the test was wrong.
- **High signal-to-token ratio.** One test per distinct behavior. No restating the
  same guarantee across many cases. Prefer a small, readable arrange/act/assert
  over exhaustive matrices.
- **Engine-direct.** Build a `ComponentRuntime` and call
  `wake(wrapper, rootContext(wrapper))`. This is the real public surface and needs
  no network, no import maps, no build step.
- **Stub the boundary, don't mock the world.** The loader's async machinery
  (`fetch`, dynamic `import`, blob URLs, import-map injection) is not modeled by
  happy-dom and is not the lib's logic. Where a test needs loading to *happen*,
  pass a fake loader to `wake(wrapper, rootContext(wrapper), fakeLoader)` and
  assert the observable effect.
- **Failures must name themselves.** A red test should read as a sentence about
  the broken guarantee, not an opaque assertion dump.

## The `load()` boundary

`load()` (fetch → import component → append → wake) sits on browser behavior
happy-dom does not fully provide. The real round-trip is verified manually via
the showcase pages, and may later get a thin Playwright smoke test. No e2e,
snapshot, coverage-gate, or CI work is in scope here.

The observable child-loading contract can still be tested without reaching into
private fields: call `wake(wrapper, rootContext(wrapper), fakeLoader)` and assert
that nested hosts are handed to the loader with the right mounted behavior. A
narrow `load()` test may stub `fetch` and the documented shim path
(`globalThis.importShim`) when it is the least-coupled way to prove
`context.props`, but tests should not assert import-map or blob-URL mechanics.

## Layout

```
tests/
  setup.ts          happy-dom global registrator (preloaded via bunfig.toml)
  resolution.test.ts core: name → source resolution
  scopes.test.ts     core: scope climb, block transparency, miss policy, `//id`
  core.test.ts       core: action/flush, *list, *if
  inputs.test.ts     004/008/009: props-facing behavior, `/key`, parent and cross inputs
```

A test "wrapper" is a detached element carrying `_unsubs`, `_listCache`, and an
optional `_component`; constructing it detached avoids `connectedCallback` firing
so each test drives `wake`/`load` explicitly.

## Core contract

The guarantees 1.0 commits to. Each is one test unless noted.

**Resolution**
- bare name reads a component module export
- factory instance binding shadows a module export of the same name
- bare name is **local-first and climbs the scope ladder**: it resolves against
  the nearest row that owns the key, then outer rows, then the component runtime
  *(post-pivot behavior; the old suite asserted bare names skip the row entirely)*
- a bare name climbs past an inner row that lacks the key to an outer row that
  owns it
- `./key` reads the nearest enclosing `*list` row item — explicit local scope,
  no climb
- `../key` reads the parent row item; each additional `../` climbs one more row
- `/key` reads the component/root scope and bypasses row scopes
- `//id/key` reads another loaded wrapper's component/root scope by DOM id
- a bare name that resolves nowhere up to the root renders a static literal,
  emits `console.warn`, and does not abort its sibling bindings
- a missing `//id/key` target or path warns and stays inert — it does not render
  a static literal

**Reactivity**
- `action(fn)` flushes after the call returns
- `action({...})` wraps each value independently
- `action(action(fn))` is idempotent (no double-flush)
- an imported `action`-wrapped writer flushes a *consuming* runtime
- `flush()` republishes only outputs whose value changed (`Object.is`)

**Directives**
- `*list` adds new rows, updates existing rows in place, removes dropped rows by key
- removing a row tears down its subscriptions and nested-list caches (leak guard)
- `*if` adds its body when truthy, removes it when falsy; `./` inside still sees
  the surrounding row

**Events**
- bare `@name` activates the matching component action
- `@event` dispatches with `detail.item` from the nearest row
- `?prevent` / `?stop` / `?immediate` modifiers take effect

## Ticket 004: child wrapper inputs

**Props semantics:**
- Child inputs are factory-only. Query entries become `context.props`; they are
  not auto-bound and do not create an input tier in lookup.
- A resolved input is a stable function reader backed by the parent source; a
  literal input is a stable value.
- `?date=dateAlias` aliases the parent binding `dateAlias` to the child prop
  `date`; `?start=5` yields the static string `"5"` when no binding resolves.
- Unresolved input expressions become static literals and do not warn.
- `props.url` is reserved and always contains the full `src` string.
- A template can bind an input only after the factory returns it as an instance
  binding; instance bindings still shadow module exports.
- Nested component paths resolve the first segment through `instance > module`,
  then read the remaining path from that value. A missing first segment is a
  normal binding miss; a missing deep property renders empty.

**Wake orchestration (stubbed loader):**
- connecting a wrapper triggers a wake rather than a direct load
- a root host with `src` is loaded exactly once
- a nested host is loaded with its parent's binding context at the mount point;
  the parent wake does not descend into the child's contents
- loading is idempotent: waking the same host twice loads once
- a nested host that wakes itself before its parent claims it does not self-load;
  it loads once the parent reaches it

## Todos

- [x] Scaffolding: `tests/setup.ts` + `bunfig.toml` (`preload`) + `"test"` script.
- [x] Climb-depth: bare names climb to the root; a total miss warns and renders
      a static literal.
- [x] Validate the harness — `bun test` green on the current contract suite.
- [x] Review 004 tests for the real `context.props` creation path without
      coupling to loader internals.
- [ ] Decide if/when a Playwright smoke test covers the real `load()` round-trip.
