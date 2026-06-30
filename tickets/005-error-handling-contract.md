# Ticket 005: Error Handling Contract

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

## Review Blockers

These were found during Codex review and need to be addressed before this ticket
can be marked complete.

### 1. `connectedCallback()` load error wrapper fails typecheck

`src/lib/element.ts` currently calls:

```ts
load(this, src).catch(...)
```

But `load` is typed as `WrapperLoader`, which returns `void | Promise<void>`.
That makes `bun run typecheck` fail because `void` has no `.catch()`.

Use the same shape as child-wrapper loading:

```ts
Promise.resolve(load(this, src)).catch(...)
```

### 2. Post-swap `wake()` failure can still leave a half-loaded wrapper

`load()` sets `_loadedSrc = src` before calling `wake()`. If `wake()` throws
after the new content has been appended, the wrapper can be left partially
woken while future attempts to load the same `src` short-circuit.

Ticket 005 acceptance requires failed wrappers not to silently enter a
half-loaded state. At minimum, `_loadedSrc` should not be committed until
`wake()` succeeds, or the failure path should otherwise leave the wrapper in a
retryable state.

### 3. Error detail docs overstate current guarantees

`views/docs/errors.html` says every error carries the view URL, wrapper `src`,
or binding/action name. Some paths still propagate the underlying error without
that attribution, especially direct `load()` factory failures and user action
failures.

Either wrap those paths with the promised phase/wrapper/module detail, or narrow
the docs to the guarantees the implementation actually provides.
