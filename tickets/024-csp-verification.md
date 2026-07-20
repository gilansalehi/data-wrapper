# Ticket 024: Verify the security page's CSP claims in a real browser

**Suggested owner: Claude (Fable) drives, the user runs the browser passes.**
Flagged as unsuitable for a smaller model — and for unsupervised execution
generally: the deliverable is *verified* facts about browser behavior, and
the known failure mode is an agent narrating a plausible CSP policy that was
never actually run. Every claim that lands in the docs must come from an
observed browser result (runtime-verification norm).

## Goal

`site/views/info/security.html` (CSP Level 3 row, ~line 93) currently
*asserts* the framework's CSP posture: `script-src` must allow `blob:` plus
the `data-shim-src` host, strict `script-src` unsupported. These claims are
reasoned from the code (blob-URL modules at `element.ts:111-113`, runtime
import-map injection at `element.ts:115-118`), not observed. Ticket 014
lists "Security section matches the current runtime contract" as an open
smoke item — this ticket closes it for CSP, and produces a copy-paste policy
an adopter can actually deploy.

## Method

1. Serve the site locally with a CSP header (a `CSP` env var in `serve.ts`
   is the smallest harness; do not add permanent config surface).
2. Establish the **minimal working policy** empirically: start strict, watch
   the console, loosen one directive at a time. Questions to answer:
   - Does the injected import map require `script-src 'unsafe-inline'`, or
     do hashes / `'strict-dynamic'` cover a dynamically appended inline
     script? (Import maps are subject to `script-src`; the answer decides
     how bad our CSP story is.)
   - Is `script-src blob:` alone sufficient for view modules, including
     nested `*src` loads?
   - Confirm the shim host requirement disappears under ticket 020's
     self-host option.
3. With `require-trusted-types-for 'script'` enabled, record *which* sinks
   report violations (loader innerHTML at `element.ts:249`, `$unsafeHTML`,
   `srcdoc`). This scopes the already-planned Trusted Types tier; build
   nothing.

## Deliverables

- The CSP row on the security page rewritten from observed results, plus a
  short "recommended CSP" snippet an adopter can paste.
- A findings note (in this ticket on close-out) scoping the Trusted Types
  tier for a future ticket.

## Non-Goals

- No strict-CSP compatibility work, no Trusted Types implementation — 014
  already declares the strict tier a beta non-goal. This ticket documents
  reality; it does not change it.

## Acceptance

- Every CSP statement on the security page traces to a browser observation
  from this ticket (user-witnessed), not to reasoning from source.
- The recommended policy is verified against home, framework, info, and
  compare pages — including the todos/orders demos and one `*src` swap.

---

## Status 2026-07-16 — harness ready, browser passes are next

The `CSP` env-var harness is in `serve.ts` (Claude): set `CSP='...'` and every
response carries that `Content-Security-Policy` header; unset means no header.
Typecheck green. No other config surface added.

### Browser pass procedure (user runs; record console output verbatim)

Run each policy below, then visit **home, framework, info, compare,
playground**, exercise the **todos + orders demos**, and trigger one ***src
swap** (composer tabs). Note every CSP violation the console reports — the
violated directive and the blocked resource — before moving to the next rung.

Rung 1 — strict baseline (expected to break; the errors are the data):

```sh
CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'" bun serve.ts
```

Rung 2 — add `blob:` for view modules (answers: is `blob:` alone enough for
component scripts, including nested `*src` loads?):

```sh
CSP="default-src 'self'; script-src 'self' blob:; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'" bun serve.ts
```

Rung 3 — add `'unsafe-inline'` to script-src (answers: do the inline theme
snippet + inline import map need it, or did rung 2 already pass them?):

```sh
CSP="default-src 'self'; script-src 'self' blob: 'unsafe-inline'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'" bun serve.ts
```

Rung 4 — add `'unsafe-inline'` to style-src (component `<style>` tags):

```sh
CSP="default-src 'self'; script-src 'self' blob: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'" bun serve.ts
```

Rung 5 — shim host: repeat the passing rung with `https://ga.jspm.io` added to
`script-src` in a browser that needs the shim (or force it by clearing native
import-map support assumptions); confirms whether adopters must list the shim
host.

Rung 6 — Trusted Types probe: append
`; require-trusted-types-for 'script'` to the passing policy and record WHICH
sinks report violations (candidates from source: loader innerHTML, `$unsafeHTML`,
`srcdoc`). Observation only — scopes the future Trusted Types tier.

### Close-out

The minimal passing policy from the rungs becomes the "recommended CSP"
snippet on `views/info/security.html`, and the CSP row there gets rewritten
from these observations. Findings note lands here.
