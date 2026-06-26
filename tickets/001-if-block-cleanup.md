# Ticket 001: Block-Local Cleanup for `*if`

## Goal

Make `*if` dispose bindings created inside a removed conditional clone without
waiting for the nearest row or wrapper to be destroyed.

## Rationale

`*if` currently removes the cloned DOM subtree, but subscriptions created while
that clone was woken can remain registered on the nearest row or wrapper. That
means repeated show/hide cycles can accumulate stale DOM effects.

This is the most important known cleanup gap in the current binding model.

## Scope

- Add a cleanup owner for each live `*if` clone.
- Ensure bindings created while waking the clone are registered to that clone's
  owner.
- Dispose the clone owner when the condition turns false.
- Preserve existing author syntax:

  ```html
  <template *if="visible">...</template>
  <template *if="./done">...</template>
  ```

## Non-Goals

- No retained-block behavior.
- No animation lifecycle.
- No new public lifecycle API.
- No changes to `*list` reconciliation.

## Acceptance

- Repeated toggling of a root-level `*if` does not grow `wrapper._unsubs`.
- Repeated toggling of a row-level `*if` does not grow `row.unsubs`.
- Bindings inside the clone stop updating after the clone is removed.
- Existing `*if` examples keep working.
