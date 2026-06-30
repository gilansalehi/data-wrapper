# Ticket 007: Directive API Stability

## Goal

Lock the public custom directive API for 1.0.

## Rationale

`DW_DIRECTIVES` is the extension point for structural behavior. The binding
context refactor intentionally changed `DirectiveContext` to carry `ctx` rather
than derived `wrapper` and `row` fields. Before 1.0, this API should be stable
and documented.

## Scope

- Decide the final `DirectiveContext` shape.
- Decide which helpers are public:
  - `nearestRow`
  - `rootContext`
  - `childContext`
  - `ownerUnsubs`
  - `own`
- Document directive return behavior.
- Clarify directive cleanup ownership.
- Update the docs-site `*source` custom directive if needed.

## Non-Goals

- No new built-in directives.
- No directive priority system.
- No compile-time directive validation.
- No lifecycle hook matrix.

## Acceptance

- Custom directives can read parsed binding fields, element, context, and wake
  nested DOM.
- Custom directives can register cleanup through the supported mechanism.
- Public helper exports are intentional and documented.
- Existing built-in `*list` and `*if` match the public API.

## Decisions

- `DirectiveContext` is the stable directive surface:
  - parsed binding fields from `pURL`: `path`, `isRel`, `parent`, `params`,
    `host`, `protocol`
  - `el`: the element carrying the directive
  - `ctx`: the current `BindingContext`
  - `wake(node, ctx)`: wires directive-created DOM under an explicit context
  - `cleanup(off)`: registers directive-owned teardown with the current context
- `DirectiveHandler` returns a `DirectiveUpdater`; the framework owns the
  source subscription and calls the updater with current/future values.
- Custom directive cleanup should use `DirectiveContext.cleanup()`, not raw
  access to context unsubscribe arrays.
- Public directive authoring exports are `DW_DIRECTIVES`, `DirectiveContext`,
  `DirectiveHandler`, `DirectiveUpdater`, and `nearestItem(ctx)`.
- `nearestRow` is not part of the post-scope-refactor API; use
  `nearestItem(ctx)` when row data is needed.
- `childContext`, `ownerUnsubs`, and `own` are internal implementation helpers,
  not public directive API.
- `rootContext` and `wake` remain exported for engine-direct mounting and the
  test harness; custom directives receive the scoped `wake` closure through
  `DirectiveContext`.

## Review notes (Claude, 2026-06-30)

Delivery matches the agreed API — `cleanup` on the context, `own`/`ownerUnsubs`/
`childContext` internal, and `*list`/`*if` switched onto `cleanup()`. Two small
follow-ups (Codex can fold these in):

1. **State the scoping boundary.** A custom directive can only `wake(node, ctx)`
   under the context it is *handed* — with `childContext`/`blockContext` internal,
   it cannot introduce a new data scope the way `*list` does. That's the right
   1.0 line (custom directives are effects/decorators/toggles), but it should be a
   documented limitation in `directives.html`, or an author may expect to build a
   per-item-scoped directive and find no helper. Scope-introducing directives = a
   future ticket that exposes a scope helper.

2. **`host`/`protocol` in the field table are inert.** `directives.html` lists
   them next to `path`/`isRel`/`params` as parsed binding fields, but they're
   dwrl-parse artifacts reserved for future `//host` addressing and do nothing
   today. Drop them or mark them reserved so authors don't reach for them.

Contract tests are in `tests/directives.test.ts`.
