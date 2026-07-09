# Ticket 025: AI docs — llms.txt, llms-full.txt, agent.md

**Source:** site-shape brief §3.10 / §8-Ticket-7.
**Suggested owner:** Opus or Codex. Well-scoped, no lib changes.
**Effort:** small. The highest leverage-per-hour item in the brief.

## Goal

Agents that encounter data-wrapper will hallucinate its API — the very brief
this ticket comes from invented `*for`, `*match`, and inline `$count`
interpolation. Ship the standard AI-docs files so agents have a canonical,
correct source:

- `site/llms.txt` — short: one-paragraph description, then links to the
  canonical pages (/framework, /info, /compare, /tutorials) and to
  llms-full.txt.
- `site/llms-full.txt` — the full reference in one plain-text file: the three
  tokens, the DWRL binding grammar (bare, `./`, `../`, `/`, `//host/`,
  `?formatters`), the three directives, module/factory contract
  (`props`/`slots`/`cleanup`), `action`/`flush`, error behavior, security
  contract (sinks, allowlist matrix), and 3–4 complete real view files
  (counter, todos) copied verbatim from `site/views/showcase/`.
- `site/agent.md` — instructions for coding agents building WITH the
  framework: where truth lives, the single-root template rule, unique
  `data-module` names, "bindings are attributes, never text interpolation",
  "do not invent directives — there are exactly three."

## Ground rules

- **Source of truth is `src/lib/` and the framework guide views** — not the
  site-shape brief (its examples are wrong; see the warning at its top).
- Prefer assembling llms-full.txt from existing doc-view prose over writing
  fresh claims. Every API statement must be checkable against source.
- Keep llms.txt under ~40 lines; it's a pointer file, not documentation.

## Acceptance

- All three files served (they're static — Cloudflare Pages serves them
  as-is; verify `/llms.txt` returns text/plain locally on :3000).
- A cold agent given only llms-full.txt can write a working counter view
  with no invented APIs (spot-check by prompting one).
- Reviewer verifies every API claim against `src/lib/` (`file:line` on
  anything surprising).
