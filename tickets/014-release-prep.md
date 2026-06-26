# Ticket 014: 1.0 Release Preparation

## Goal

Bring `package.json`, repository metadata, and release artifacts to the state
required to publish 1.0 to npm.

## Rationale

The lib is shipped via `dist/data-wrapper.js` and the package is set up for
import (`"main"`, `"module"`, `"exports"` all point at the build), but the
metadata around it is thin. A 1.0 published to npm should include the fields
consumers expect: repository, homepage, bugs, license, full keyword list.

A CHANGELOG also needs to exist before 1.0 ships so the next release has a
real "what changed since" surface. Starting from "1.0.0 — first release" is
honest; starting in 1.1 with no history is not.

## Scope

- `package.json`:
  - add `repository`, `homepage`, `bugs` URLs
  - expand `keywords` beyond the current short list
  - add `author` and confirm `license: MIT`
  - confirm `"files": ["dist"]` is the intended publish surface (it is)
  - add `"sideEffects": false` if true (verify against `customElements.
    define` call)
  - bump `version` to `1.0.0-rc.0` for pre-release testing
- Add `LICENSE` file at project root (MIT, full text, correct year).
- Add `CHANGELOG.md` at project root following Keep a Changelog format,
  with an `Unreleased` section and a `1.0.0` placeholder.
- Verify `dist/data-wrapper.js` (ESM) and `dist/data-wrapper.min.js` (IIFE)
  both load standalone from a script tag in a fresh HTML file.
- Run `npm pack --dry-run` and confirm the published tarball contains only
  intended files (no `archive/`, `tickets/`, `views/`, `state/`, source `.ts`
  files, etc.).

## Non-Goals

- No semver policy document beyond what Keep a Changelog implies.
- No release automation / GitHub Actions.
- No publish-to-npm in this ticket (that's the actual 1.0 cut).
- No TypeScript declaration output (`dist/data-wrapper.d.ts`) — that's a
  separate decision about whether we ship types, which depends on whether
  the public `engine.ts` / `component.ts` exports stabilize first.

## Acceptance

- `npm pack --dry-run` lists only `dist/`, `package.json`, `README.md`,
  `LICENSE`, `CHANGELOG.md`.
- `package.json` validates (`npm pkg get`).
- A fresh HTML file with `<script src="dist/data-wrapper.min.js"></script>`
  and a `<data-wrapper>` element renders correctly without any other setup.
- `CHANGELOG.md` exists with a populated `1.0.0` section reflecting the
  features and known limitations 1.0 ships with.
