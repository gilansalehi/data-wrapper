# Ticket 005: Error Handling Contract

**COMPLETED.**

## Goal

Define and implement the public error handling behavior for wrapper loading,
module import, factory initialization, wake/wire, and directive failures.

## Rationale

The current implementation mixes thrown errors and console logging. Before 1.0,
framework users need a predictable way to observe and handle load/runtime
failures.

## Scope

- Identify error phases:
  - fetch/load
  - parse
  - module registration/import
  - default factory
  - wake/wire
  - directive execution
  - action execution
- Decide whether errors are:
  - thrown
  - logged
  - emitted as `dw/error`
  - reflected as wrapper state
- Ensure failed wrappers do not silently enter a half-loaded state.

## Non-Goals

- No retry system.
- No error boundary component model.
- No UI rendering for errors unless needed for internal state.
- No logging framework.

## Acceptance

- Load/import/factory errors are observable through one documented mechanism.
- The console output remains useful during development.
- Errors include enough detail to identify phase, wrapper, and module/view.
- Existing successful views keep working unchanged.

## Shipped

- Top-level and child wrapper load failures propagate as uncaught promise
  rejections with the failing `src` attached to the wrapper error.
- Framework-raised load/import/factory-shape/directive errors include the view,
  module, or directive detail the framework owns.
- User factory and action errors propagate as-is instead of being rewritten.
- `_loadedSrc` is committed only after a successful `wake()`, so a wake-time
  failure leaves the wrapper retryable instead of silently half-loaded.
- `views/docs/errors.html` documents the public mechanism and the narrower
  attribution guarantees.
