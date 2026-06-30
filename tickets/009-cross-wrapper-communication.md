# Ticket 009: Cross-Wrapper Communication Policy

**COMPLETED.**

## Goal

Define the official communication channels between independent wrappers.

## Rationale

The framework now has several possible channels:

- ES module imports for shared state
- events for upward/outward notifications
- URL params or future inputs for parent-to-child configuration
- maybe provide/inject or explicit parent references later

Before 1.0, users need clear guidance on what is supported and what is
intentionally not supported.

## Scope

- Document primary channels:
  - module imports for shared application state
  - events for component signals/actions
  - explicit child inputs for per-instance configuration
- Decide whether any additional cross-wrapper mechanism is needed for 1.0.
- Reserve implicit cross-tree lookup unless there is a strong case.

## Non-Goals

- No global wrapper registry by default.
- No implicit ancestor lookup inside child contents.
- No service locator.
- No provide/inject unless explicitly accepted after review.

## Acceptance

- README explains how wrappers should share state and communicate.
- The framework avoids ambiguous implicit cross-wrapper lookup.
- If an escape hatch exists, it is clearly marked as explicit and advanced.
- Existing module import demos remain the canonical shared-state example.

## Decision

The supported channels are:

- ES module imports for shared application state.
- Child inputs for parent/row-to-child configuration.
- DOM events for component signals.
- `//id/path` as an explicit advanced read escape hatch.

`//id/path` uses the current document's DOM id lookup. The target must be a
loaded `<data-wrapper id="id">`; the path resolves against that wrapper's
component scope only, with instance bindings shadowing module exports just like
local component bindings. It does not read row scopes, dispatch actions, create
a framework registry, wait for future loads, or retry after reload. Misses warn
and leave the binding/input unset rather than falling back to a static literal.
