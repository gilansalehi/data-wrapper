# Ticket 021: Document the "views are code" trust boundary

**Suggested owner:** Opus writes (content is enumerated below), Codex or Claude
reviews against the actual code paths.
**Difficulty:** low judgment — the analysis is done; this is careful writing.

## Goal

The sharpest security edge in the framework is not a bug, it's the trust
model: `load()` fetches HTML and **executes its module script**
(`src/lib/element.ts:249-265`). The same-origin check is the load-bearing
gate, which means *any same-origin HTML is trusted code*. The security page
documents the gate but not its two operational consequences. Documentation is
the fix — no lib change.

## Content to add

In `site/views/info/security.html`:

1. **Under "Scope & threat model"** — a short paragraph stating plainly:
   loading a view runs its `data-module` script with full page privileges.
   Two rules follow:
   - Never flow user input into a `src` attribute or a `*src` binding — a
     user-controlled string becomes a same-origin fetch-and-execute
     (`srcDirective` string branch, `src/lib/engine.ts:720`).
   - Never serve user-uploaded files from the application origin. A site
     that hosts uploads at `/uploads/…` has made every upload a candidate
     view; combined with any attacker-influenced view path this is XSS with
     module privileges. Serve uploads from a separate origin.
2. **Update the "Same-origin view loading" bullet** to mention `*src`: it
   creates child wrappers that go through the same `load()` gate, so the
   origin check holds — but the *value* of the binding is trusted, per rule
   above.
3. **Under "Application responsibilities"** — name the dangerous sinks as a
   single list a reader can memorize: `src` / `*src` (code execution),
   `$unsafeHTML` and `$srcdoc` (raw HTML), plus a one-line footnote that
   `$style` with untrusted input is CSS injection (defacement/exfiltration
   tricks; no script execution in modern browsers).

In `site/views/docs/composition.html` (framework guide):

4. A short warning near the `*src` section: `*src` values are trusted like
   code — bind application state, never user input.

## Non-Goals

- No lib changes, no new guards. (A configurable view-path allowlist was
  considered and parked as a quibble — docs first, config surface only if
  dogfood demands it.)
- No rewriting of the existing security page structure; extend it.

## Acceptance

- Every claim added is checked against the cited code path before merge
  (verify-before-asserting: `file:line` in the review).
- The security page and composition doc read as one contract; no duplicated
  or contradictory statements between them.
