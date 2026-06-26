# Ticket 002: Move-Safe Reconciliation and Nested Wrapper Safety

## Goal

Make keyed list reconciliation preserve live DOM/component identity during
reorders without accidentally destroying nested `<data-wrapper>` instances.

## Rationale

`reconcile()` preserves row node identity, but moving existing nodes through a
fragment can temporarily disconnect them. For plain DOM this is usually fine.
For nested custom elements, `disconnectedCallback()` can tear down component
runtime state even though the row was only moved.

Nested wrappers inside keyed lists are an important composition case before
1.0.

## Scope

- Audit current row move behavior.
- Decide between:
  - avoiding detach for stable rows during reorder, or
  - making `DataWrapper.disconnectedCallback()` move-safe/deferred.
- Ensure keyed row reorders do not destroy nested wrapper runtimes.
- Keep existing row identity and key semantics.

## Non-Goals

- No virtual DOM.
- No new list diffing algorithm beyond what is needed for move safety.
- No dynamic `src` behavior.
- No parent-child props design.

## Acceptance

- Reordering a keyed list preserves row DOM node identity.
- Reordering rows containing nested `<data-wrapper>` elements does not reload
  or destroy child component state.
- Removing a row still tears down its nested wrappers.
- Existing `*list` behavior remains unchanged for simple lists.
