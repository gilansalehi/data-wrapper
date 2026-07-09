# Ticket 028: Playground spike — edit a view, see it live

**Source:** site-shape brief §3.7 / §4.1 / §8-Ticket-4 — its "centerpiece."
**Suggested owner: Claude (Fable) spikes the loader question; then Codex
builds the UI if the spike passes.** Flagged: NOT low-hanging fruit — this is
the flagship, and it hides a loader/security question that must be answered
before any UI work. A smaller model building the UI first would produce a
pretty shell around a broken core.
**Effort:** spike small; MVP medium.

## The spike question (answer first, build second)

Can the existing loader run a user-edited view with **zero lib changes** via
a Blob URL?

Hypothesis: `URL.createObjectURL(new Blob([editedText], { type: 'text/html' }))`
→ set as a wrapper's `src`. Reasoning to verify, not trust:

- `new URL(blobUrl).origin` should equal the page origin (blob URLs carry
  their creator's origin), so `isTrustedViewSource` (element.ts:33) should
  pass. **Verify in a real browser — do not assume.**
- `fetch(blobUrl)` returns the text; `tpl.innerHTML` parses it; real
  browsers keep `*`-prefixed attributes (only happy-dom strips them).
- Re-running: revoke the old blob URL, create a new one, set `src` — the
  `_loadedSrc !== src` guard makes each edit a fresh load. Old wrapper must
  be torn down (remove + re-add the element) so state resets.
- `data-module` cache: every edit needs a unique module name or the module
  cache serves the stale script (element.ts `componentModules`). The
  playground must rewrite/inject `data-module="play-<nonce>"` per run.

If any of these fails in-browser, STOP and write up what lib support would
be needed (e.g., a `load()` text-input path) — do not hack around the
security gates.

## Security note

The playground executes whatever the user types — in their own browser, on
our origin. That is self-XSS-adjacent but standard for framework
playgrounds. Rules: no sharing/persistence of playground content in this
ticket (no URL-encoded state — that would make it a reflected-XSS vector),
and the security page's threat model is unaffected. Revisit sharing only
with a dedicated design.

## MVP scope (after spike passes)

- Two panes: textarea (left), rendered wrapper (right). No CodeMirror — a
  mono textarea is on-brand.
- Default content: the real counter view, verbatim.
- Run button (not on-keystroke), Reset button.
- Errors visible: surface the load error text into the preview pane.
- A `/playground` page in the site shell, nav + sitemap per precedent.

## Acceptance

- Spike findings written into this ticket with browser-observed results.
- MVP: edit default counter, click Run, click the button, state works.
- A syntax error in the edited view shows a readable error, not a blank
  pane or silent console-only failure.
