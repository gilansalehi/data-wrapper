# Ticket 004: Child Wrapper Input Model

## Goal

Define the official parent-to-child input channel for nested `<data-wrapper>`
composition.

## Rationale

Module imports solve shared state. Binding contexts solve template-local row
data. A child wrapper still needs a clear way to receive per-instance
configuration from its parent, especially when nested inside a list.

The current project should avoid making `dataset` the primary state model, but
it can remain a useful debugging/configuration surface.

## Scope

- Evaluate minimal input options:
  - URL query params
  - `data-*` attributes
  - bound DOM properties
  - a structured `props` object
- Decide which one is the 1.0 path.
- Document how child factories read the chosen input.
- Preserve component boundary rules:
  - parent wires the child host element
  - child contents wake under the child component context

## Non-Goals

- No implicit parent-scope lookup inside child contents.
- No provide/inject.
- No dynamic `src` reload semantics unless explicitly chosen.
- No cross-wrapper global registry.

## Acceptance

- A parent can pass per-row data to a child wrapper intentionally.
- The child can read that input from its factory context or host element.
- The input model works with repeated child wrappers in a list.
- The README clearly describes the supported 1.0 input path.
