# Ticket 020: Subresource Integrity for the module-shim fallback

## Status (2026-07-16)

Runtime support is implemented and covered by a focused security test:
`data-shim-integrity` is copied to the injected shim script and sets
`crossOrigin = 'anonymous'`.

Implementation is wired. Site adoption uses a third-party pinned CDN shim. The
site shells and docs now carry a blank `data-shim-integrity="sha384-Ojz/JNsyOdkNfGWOlfhDmeq68SXcsoWSABV4yVQn8Wr/YaKJJTrZs5p2Zi39PWuL"` slot next to
the pinned `es-module-shims@2.8.1` URL.

Final release step: release owner fills that slot with the trusted
`sha384-...` value for the exact CDN file before publishing.

**Suggested owner:** Codex implements (loader territory), Opus or Claude tests + reviews.
**Difficulty:** well-scoped, standalone. Safe for any agent.

## Goal

The es-module-shims fallback is the one third-party script the framework will
load at runtime, and today it loads with no integrity check. `loadShim()`
(`src/lib/element.ts:54-63`) creates the script element from `data-shim-src`
and appends it — if that CDN is ever compromised, it is arbitrary code on every
page that hits the fallback path. Close this with opt-in SRI support.

## Spec

1. Support a `data-shim-integrity` attribute on the same `<script>` tag that
   carries `data-shim-src`. When present, the injected script element gets
   `integrity` set to that value and `crossOrigin = 'anonymous'` (SRI on a
   cross-origin script requires CORS). When absent, behavior is unchanged —
   SRI stays opt-in, the docs make it recommended.
2. Update the install docs (`site/views/docs/install.html` and the
   `docs-install-05-shim-fallback` snippet) so the canonical shim example
   carries a pinned version + integrity slot.
3. Update `site/views/info/security.html` -> "Application responsibilities":
   the existing SRI bullet covers the framework script; extend it to name
   `data-shim-integrity` for the shim.
4. Site adoption: keep `ga.jspm.io`, pin `es-module-shims@2.8.1`, and add
   `data-shim-integrity="sha384-Ojz/JNsyOdkNfGWOlfhDmeq68SXcsoWSABV4yVQn8Wr/YaKJJTrZs5p2Zi39PWuL"` on each site shell. The final hash value is supplied
   by the release owner.

## Testing

The loader is happy-dom's blind spot (`testing.md`). A narrow contract test
may be possible: stub `fetch` + drive `load()` with a view whose module import
falls through to `loadShim`, then assert the injected `<script>` in
`document.head` carries `integrity` and `crossorigin`. If that path cannot be
driven cleanly in happy-dom, do not force it — ship a browser-verification
checklist in the ticket close-out instead, per repo norm.

## Non-Goals

- No mandatory SRI (breaks anyone pointing `data-shim-src` at a mutable URL).
- No bundling of the shim into the framework artifact.

## Acceptance

- `data-shim-integrity` present → injected script has `integrity` +
  `crossorigin="anonymous"`. Absent → unchanged behavior.
- Docs and site pages updated; release owner has pasted the verified hash;
  `bun review` green; browser smoke: shim
  fallback still loads a bare-specifier view module with the attribute set,
  and fails closed (script blocked, load error surfaces) with a wrong hash.
