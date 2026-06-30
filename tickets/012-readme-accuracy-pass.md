# Ticket 012: README and Reference Docs Accuracy Pass

## Goal

Bring the README and any companion reference docs into line with current code
behavior, with worked examples for every feature 1.0 commits to.

## Rationale

The README evolved alongside several architectural pivots and now lags the
implementation in places. Specifically:

- The factory + module-scope overlay model gets one paragraph but needs a
  worked side-by-side example showing when to use each.
- Child-wrapper inputs via `src` query params are now part of the factory model
  and need a concise worked example.
- Binding resolution changed during ticket 004: bare names climb row scopes, and
  `/name` is the component/root-scope escape hatch.
- `data-module="@view/name"` has one mention and no example of consuming it
  from another module.
- URL-param event modifiers (`?prevent`, `?stop`, `?immediate`) are
  undocumented; discoverability is zero.
- `action()` and `flush()` are mentioned briefly at the bottom; the cross-
  runtime broadcast semantics and the async Promise chain behavior are not
  documented.
- The list of built-in formatters needs to match what's actually shipped
  (currently only `onoff`, expanded in ticket 014).
- No "Known Limitations" section, so the `*if` cleanup gap (ticket 001)
  and reserved binding syntax (ticket 010) are invisible to readers.

A reader installing the lib should be able to build a non-trivial component
from the README alone.

## Scope

- Audit every code example in the README against the current
  implementation; fix any that don't run as written.
- Add worked sections for:
  - the factory vs. module-scope decision, with two side-by-side counter
    examples
  - child inputs: `src="?customer&status=orderStatus"` delivered to
    `context.props`, then explicitly returned by the factory
  - supported binding forms: bare climb, `./row`, and `/root`
  - cross-module imports via `@view/name` (one producer, one consumer)
  - URL-param event modifiers, with a list of supported modifiers
  - the reactivity model: `action()` shapes (single function, object batch,
    double-wrap idempotence), `flush()` as manual escape hatch, when each
    matters
- Add a "Known Limitations" section enumerating the gaps tracked in tickets
  001 and 010.
- Remove documentation of any feature that doesn't ship in 1.0 (per
  tickets 010, 008).

## Non-Goals

- No separate docs site or generated reference.
- No tutorial-style walkthrough beyond runnable examples.
- No migration guide (no upgrade path; the lib has not had a public
  release yet).

## Acceptance

- Every code example in the README runs as written against `dist/data-
  wrapper.js` from the same commit.
- A reader can answer these questions from the README alone:
  - "How do I share state between two components?"
  - "How do I prevent a form submission inside an action?"
  - "How do I call an imported writer from a `setTimeout` and have the UI
    update?"
  - "What happens when my `*if` toggles repeatedly?"
- No documented feature is missing from the code; no shipped feature is
  missing from the docs.
