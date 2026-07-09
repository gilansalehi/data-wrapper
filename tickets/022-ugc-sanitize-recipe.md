# Ticket 022: UGC sanitization recipe (formatter pattern)

## Status (2026-07-09)

Deferred until after the alpha release. The framework already exposes
`DW_FORMATTERS`, so early adopters can register their own UGC sanitizer
formatter without new runtime code. A published recipe should wait until we
can verify the browser behavior and sanitizer fallback carefully, because this
is security documentation, not ordinary example code.

**Suggested owner:** Opus or Codex writes; the other reviews.
**Difficulty:** moderate — the pattern is specified below, but the snippet
must be tested in a real browser before it is published as a recipe.

## Goal

The security page says apps rendering user-generated HTML "own sanitization"
but never shows how. Close the gap with a documented recipe — **not** a
bundled sanitizer. Sanitizers need constant CVE-driven maintenance; bundling
one is exactly the supply-chain surface the zero-dependency promise avoids.
The extension point already exists: `DW_FORMATTERS` is a public registry
(`src/lib/engine.ts:229`, exported via `index.ts`).

## The recipe to document

A dev-registered `sanitize` formatter, so the dangerous sink and its guard
appear in the same attribute:

```html
<div $unsafeHTML="userBio?sanitize"></div>
```

```js
import { DW_FORMATTERS } from 'data-wrapper';

DW_FORMATTERS.set('sanitize', value => {
    const html = String(value ?? '');
    // Platform-first: the native Sanitizer API when present…
    if (Element.prototype.setHTML) {
        const scratch = document.createElement('div');
        scratch.setHTML(html);
        return scratch.innerHTML;
    }
    // …else the app's chosen sanitizer (DOMPurify shown; app-supplied).
    return DOMPurify.sanitize(html);
});
```

Support status to state honestly (verified 2026-07-08, cite MDN): the
Sanitizer API / `setHTML()` ships in Firefox 148 (Feb 2026) and Chrome 146;
Safari has not shipped it; it is **not Baseline**, so the DOMPurify fallback
is required for production today. Re-verify current support before publishing
— do not copy these version numbers without checking.

## Where it goes

- `site/views/docs/formatters.html`: the recipe as a subsection (custom
  formatters are already that page's territory).
- `site/views/info/security.html`: one sentence + link from the
  "Application responsibilities" list, replacing the current unqualified
  "owns sanitization" hand-wave.

## Non-Goals

- No DOMPurify (or any sanitizer) added to the repo, the site, or the
  package — the code block is illustrative, the dependency decision is the
  app's.
- No live demo widget unless it degrades gracefully where `setHTML` is
  missing; a static snippet is acceptable and safer.

## Acceptance

- The snippet is executed once in a real browser (both branches if possible)
  before the doc ships — no publishing untested security code.
- Docs updated in both places; `bun review` green.
