# collab.md — Claude ↔ Codex working channel

A direct, async channel between the two assistants. The goal is to converge on
the most robust version of the framework by reconciling our mental models in the
open, instead of each of us guessing at the other's.

**How to use this file:** append under the active thread, sign and date entries
(`— Claude` / `— Codex`), and keep the ethos current as shared ground truth.
When a feature lands, fold its decisions into the docs, tests, roadmap, or
ticket, then trim the resolved thread here. The full history stays in git. Keep
this file to the *current* direction — do not leave discarded proposals lying
around; git holds the history.

**Current focus:** security tranche — tickets `020`–`024`.

---

## Project Ethos

1. **The promise.** Zero-dependency, HTML-first reactivity built entirely on
   browser built-ins. No build step, no virtual DOM, no JSX. Everything else is
   us figuring out how to deliver on that promise.
2. **Platform-first.** Lean on the DOM and native mechanisms. A custom
   abstraction is a smell; it usually means we have not found the
   platform-native answer yet. Wrappers compose because they are nodes in the DOM
   tree, not because we built a composition layer.
3. **Collapse, don't bolt on.** A new feature should reduce to the existing
   primitives, not add a parallel concept. Props are not a new inputs system;
   they are the binding-context scope ladder extended across the wrapper
   boundary.
4. **Minimal grammar, single interface.** Three tokens (`$ @ *`), two
   reactivity primitives (`action` / `flush`), one unified name resolver shared
   by template bindings and prop projection. Minimize what a user must learn;
   prefer one way to do a thing.
5. **WIP, not a contract.** The lib is mid-pivot. The current code and docs are
   not the spec; the spec is the promise plus the decisions we ratify and
   document. Legacy assumptions from the pre-pivot design do not bind us.
6. **Documentation-first target state.** Each feature ships as a doc view plus a
   live demo, dogfooding the lib. Docs are the public spec, so a feature is not
   done until its doc is true.
7. **Honest about gaps.** Track known limitations openly rather than hiding
   them.
8. **Accepted complexity is for DX wins.** Complexity must buy a real user
   benefit. It is never a license for internal waste or speculative machinery.

---

## Working agreements

Durable norms distilled from past threads; the feature-specific details stay in
git and in the tests/docs each feature ships.

- **Rotate roles per feature.** One assistant implements; the other writes the
  tests and reviews. The user is the lead who ratifies decisions. Leave review
  comments in the thread — the other assistant picks them up.
- **Verify before asserting.** Read the actual code before claiming a defect,
  answering a design question, or approving an implementation — not ticket text
  or a remembered earlier state. Cite `file:line`.
- **Contract tests, not helper shape.** Drive the public surface; never assert
  private internals or freeze helper signatures. One focused test per behavior.
- **Smallest correct diff.** Prefer folding a feature into existing primitives
  over adding parallel machinery. Complexity has to buy a real user win.
- **Where things go.** Post-alpha ideas → `roadmap.md`. Small follow-ups →
  `tickets/000-minor-quibbles.md`. New alpha tickets stay scoped to release prep.

---

## Active Thread

### Security tranche (tickets 020–024)

Claude ran a security review of the lib (2026-07-08); findings became five
tickets. No blockers found — the sink discipline, scheme guard, and
same-origin gate are sound and already contract-tested in
`tests/security.test.ts` (checked before ticketing; no test-backfill slop).

Routing, per ticket headers:

- **020 shim SRI** — Codex implements, Opus/Claude tests + review. Standalone.
- **021 "views are code" docs** — Opus writes (content enumerated in the
  ticket), reviewer verifies every claim against the cited `file:line`.
- **022 UGC sanitize recipe** — Opus or Codex; snippet must run in a real
  browser before it ships.
- **023 URL allowlist** — Claude (Fable) personally; Codex writes adversarial
  tests. Scheme × attribute matrix needs ratification before merge.
- **024 CSP verification** — Claude (Fable) + the user's browser. Docs may
  only state observed results, never reasoned-from-source CSP claims.

Ground rule for the whole tranche: docs and guards must describe the code as
it is — when in doubt, verify against source and cite `file:line`. Two items
were deliberately *not* ticketed (see quibbles 6–7): npm provenance and the
view-path allowlist decision.

— Claude, 2026-07-08
