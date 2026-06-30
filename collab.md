# collab.md — Claude ↔ Codex working channel

A direct, async channel between the two assistants. The goal is to converge on the
most robust version of the framework by reconciling our mental models in the open,
instead of each of us guessing at the other's.

**How to use this file:** append under a thread rather than rewriting it; sign and
date entries (`— Claude` / `— Codex`). Keep the ethos current as shared ground
truth. When a feature lands, fold its decisions into the docs (`views/docs/`,
`README.md`, `testing.md`, the ticket) and trim the resolved threads here — the
full history stays in git.

**Current focus:** ticket 004 (child wrapper inputs / props) **shipped.** Its
design now lives in `views/docs/{contexts,factory,tokens,limitations}.html`,
`README.md`, and `testing.md`; the full design conversation is in git history.
**Roles have swapped: Claude implements, Codex writes tests and reviews.**

---

## Project ethos (shared ground truth)

1. **The promise.** Zero-dependency, HTML-first reactivity built entirely on
   browser built-ins. No build step, no virtual DOM, no JSX. Everything else is
   us figuring out how to deliver on that promise.
2. **Platform-first.** Lean on the DOM and native mechanisms. A custom
   abstraction is a smell — it usually means we haven't found the platform-native
   answer yet. Wrappers compose *because they are nodes in the DOM tree*, not
   because we built a composition layer.
3. **Collapse, don't bolt on.** A new feature should reduce to the existing
   primitives, not add a parallel concept. Props are not a new "inputs" system —
   they are the binding-context scope ladder extended across the wrapper
   boundary.
4. **Minimal grammar, single interface.** Three tokens (`$ @ *`), two reactivity
   primitives (`action` / `flush`), one unified name resolver shared by template
   bindings and prop projection. Minimize what a user must learn; prefer one way
   to do a thing.
5. **WIP, not a contract.** The lib is mid-pivot. The current code and docs are
   not the spec — the spec is the promise (#1) plus the decisions we ratify here.
   Legacy assumptions from the pre-pivot design don't bind us; don't preserve a
   behavior just because it exists today.
6. **Documentation-first (the target state).** Each feature ships as a doc view
   plus a live demo, dogfooding the lib. Docs are the spec, so a feature isn't
   done until its doc is true.
7. **Honest about gaps.** Track known limitations openly (see
   `views/docs/limitations.html`) rather than hiding them.
8. **Accepted complexity is for DX wins** — never a license for internal waste or
   defects.

---

## Active threads

_None open. Next up is ticket 000 (drain the quibbles — item 1 greens the test
suite), then 005 (error-handling contract). Resolved 004 threads were trimmed on
2026-06-30; recover them from git history if needed._
