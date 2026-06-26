# Ticket 009: Cross-Wrapper Communication Policy

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
