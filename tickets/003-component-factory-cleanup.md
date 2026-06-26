# Ticket 003: Component Factory Cleanup Primitive

## Goal

Add a minimal cleanup primitive for resources created by a component default
factory.

## Rationale

Default factories can create per-wrapper state, but they currently have no
formal way to clean up timers, observers, external event listeners, async work,
or subscriptions when the wrapper unloads.

Before 1.0, component-local resources need an explicit ownership contract.

## Scope

- Extend `ComponentContext` with one cleanup mechanism.
- Candidate APIs:

  ```js
  export default ({ cleanup }) => {
      const id = setInterval(tick, 1000);
      cleanup(() => clearInterval(id));
  }
  ```

  or:

  ```js
  export default ({ signal }) => {
      signal.addEventListener('abort', stop);
  }
  ```

- Dispose registered cleanup when the wrapper unloads or reloads.
- Keep named module exports and default factory return semantics unchanged.

## Non-Goals

- No mount/update/unmount hook matrix.
- No scheduler changes.
- No row-level cleanup API.
- No retained component instances across `src` reloads.

## Acceptance

- A cleanup registered from the default factory runs exactly once when the
  wrapper is destroyed.
- Cleanup runs before or during `ComponentRuntime.destroy()`, with the ordering
  documented.
- Existing default factories that ignore the new field still work.
- Type definitions describe the new context field.
