# Ticket 026: Examples gallery — /examples

**Source:** site-shape brief §3.6 / §4.4 / §8-Ticket-5.
**Suggested owner:** Codex or Opus implements; Claude reviews against house
visual style (collab.md).
**Effort:** small-medium — mostly assembly, not construction.

## Goal

A `/examples` page: a card grid of live components, each with live preview,
view-source, tags, and a one-line "what it demonstrates." This is pattern-
recognition surface for evaluators — and it doubles as the seed of the
component catalog (the "third gift" direction the user has flagged; see the
compare page roadmap section).

## Why this is low-hanging

Everything hard already exists:

- Live widgets: `views/showcase/` (todos.v3, counter.v2, theme, orders).
- View-source: `views/docs/peek.html?file=…` fetches and displays the real
  file.
- Card grid: `structure.css` `.grid` with `--card` / `--span` overrides.
- Badges/tags: `.status` / `.chip` atoms in `atoms.css`.

The work is one host page + one small card view (dogfood: a `*list` over an
exported examples array, like the compare matrix) + wiring into nav and
sitemap, following the `/compare` and `/tutorials` precedents.

## Scope

- `site/examples.html` (mind the existing `site/examples/snippets/` dir —
  the clean URL `/examples` must not collide with that directory; verify
  Pages + serve.ts resolution before committing to the path, fall back to
  `/gallery` if it collides).
- Cards for the four existing showcases first. New examples (tabs, modal,
  search/filter) are follow-ups, one ticket each IF the gallery proves out —
  do not build six new widgets inside this ticket.
- Each card: title, tags (`state`, `events`, `list`, `composition`), live
  preview, peek source, link to the relevant guide section.

## Non-Goals

- No "Open in Playground" buttons yet — playground is ticket 028's spike.
- No new showcase widgets in this ticket.

## Acceptance

- `/examples` renders all four showcases live with source peeks.
- Nav + sitemap updated (follow the /compare precedent).
- Page follows the house visual style rules in collab.md.
