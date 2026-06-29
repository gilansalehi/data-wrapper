# Testing

Status: **draft for discussion.** This documents *why* and *what* we test, so the
suite stays a safety net and never becomes a cage. The harness is wired up
(`bunfig.toml` + `tests/setup.ts`); the suite is being filled in — see
[Todos](#todos).

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
  inject a fake via `setWrapperLoader` and assert the observable effect.
- **Failures must name themselves.** A red test should read as a sentence about
  the broken guarantee, not an opaque assertion dump.

## The `load()` boundary

`load()` (fetch → import component → append → wake) is **not** unit-tested. It
depends on browser behaviors happy-dom doesn't fully provide. Its *observable
contract* — connecting a wrapper triggers a wake; a wrapper host with `src` gets
loaded once; a nested host is claimed with its parent's context — is covered by
stubbing `setWrapperLoader`. The real round-trip is verified manually via the
showcase pages, and may later get a thin Playwright smoke test. No e2e,
snapshot, coverage-gate, or CI work is in scope here.

## Layout

```
tests/
  setup.ts          happy-dom global registrator (preloaded via bunfig.toml)
  resolution.test.ts core: name → source resolution
  reactivity.test.ts core: action() / flush() / cross-runtime
  directives.test.ts core: *list reconcile + teardown, *if toggle
  events.test.ts     core: @event dispatch, modifiers, action activation
  props.test.ts      004: projected props semantics (no load)
  composition.test.ts 004: wake orchestration via stubbed loader
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
- a bare name that resolves nowhere up to the root surfaces a console error and
  does not abort its sibling bindings
- reserved syntax (`/abs`, `//host`, `../`) stays an inert no-op — distinct from
  a genuine miss

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

**Props semantics (engine-direct, no `load()`):**
- a child binding resolves a projected prop to the parent's current value
- precedence: factory return shadows a prop; a prop shadows a child module export
- liveness through destructuring: `const { x } = props; x()` reflects a later
  parent mutation (props are function readers, not snapshots)
- a prop source resolves against the *parent* context, climbing the parent's row
  scopes then its component runtime: a child mounted in a parent `*list` row reads
  `?customer` from that row
- `?date=dateAlias` aliases the parent binding `dateAlias` to the child prop `date`
- no query params ⇒ `props = {}`; an existing wrapper is unaffected
- an unresolvable projection throws an error naming the child URL, the prop, and
  the parent binding — a projection miss throws (the child cannot render without
  its declared input), whereas a template-binding miss only logs and continues

**Wake orchestration (stubbed loader):**
- connecting a wrapper triggers a wake rather than a direct load
- a root host with `src` is loaded exactly once
- a nested host is claimed with its parent's binding context and loaded; the
  parent wake does not descend into the child's contents
- loading is idempotent: waking the same host twice loads once
- a nested host that wakes itself before its parent claims it does not self-load;
  it loads once the parent reaches it

## Todos

- [x] Scaffolding: `tests/setup.ts` + `bunfig.toml` (`preload`) + `"test"` script.
- [x] Climb-depth: bare names climb to the root; a total miss is a console error.
- [ ] Validate the harness — `bun test` green on the resolution exemplars.
- [ ] Write the rest of the core tests, then the 004 tests; Codex implements.
- [ ] **Codex follow-up:** bare-name resolution must climb *all* row scopes and
      log on a total miss. Current code stops at the nearest row and misses
      silently (`resolveSource` returns null).
- [ ] Decide if/when a Playwright smoke test covers the real `load()` round-trip.
