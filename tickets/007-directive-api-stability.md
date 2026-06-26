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
