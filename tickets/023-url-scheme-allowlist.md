# Ticket 023: URL scheme guard — blocklist → allowlist

**Suggested owner: Claude (Fable) personally.** Flagged as unsuitable for a
smaller model: the diff is small but the judgment isn't — over-blocking
breaks legitimate apps quietly, under-blocking defeats the guard, and the
right answer is a scheme × attribute matrix, not a regex swap.
**Codex reviews + writes adversarial contract tests.**

## Goal

The URL guard in `setProp` (`src/lib/engine.ts:296-309`) blocks
`javascript:` and `vbscript:` by blocklist. Blocklists age badly — `data:`
and `blob:` already pass today. Invert to an allowlist: a bound URL value is
written only if its scheme is affirmatively allowed for that sink.

## Design questions to settle (in the ticket thread, before code)

1. **Base allow set.** Schemeless values (relative paths, fragments,
   query-only) plus `http:`/`https:` are uncontroversial. `mailto:` and
   `tel:` are legitimate on `href` and must not break.
2. **`data:` / `blob:` per attribute.** Likely allowed for media sinks
   (`src` on img/video/audio, `poster`) and blocked for navigation/embedding
   sinks (`href`, `action`, `formaction`, `data`, `ping`). Decide and write
   the matrix down.
3. **Unknown schemes** (`foo:`, `web+app:`): default-deny with the existing
   `console.warn` shape, consistent with current drop behavior.
4. **Escape hatch?** Probably none — an app needing an exotic scheme can set
   the attribute statically (the guard only covers *bound* values). State
   this in the docs instead of adding config surface.

## Scope

- Implementation in `setProp`'s guard path; keep the control-character
  stripping (`engine.ts:295`) — it applies to allowlist parsing equally.
- Audit the site's own views for bound URL values that must keep working.
- Update `site/views/info/security.html`: the "URL-scheme neutralization"
  bullet and the OWASP RULE #5 row now describe an allowlist.
- Extend `tests/security.test.ts`: `mailto:` allowed on href; `data:` href
  per decision; `data:` img src per decision; unknown scheme dropped;
  obfuscated `java\tscript:` still dropped (existing test keeps passing).

## Non-Goals

- No per-app configurable scheme list in this ticket (config surface needs
  its own justification; default matrix first).

## Acceptance

- The scheme × attribute matrix is written in the security docs, not just
  in code.
- `bun review` green; every existing security test passes unchanged.
- User ratifies the matrix before merge.
