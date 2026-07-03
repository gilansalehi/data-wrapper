# Ticket 014: 0.1 Public Beta Release Preparation

## Goal

Bring `package.json`, repository metadata, and release artifacts to the state
required to publish the first public beta to npm.

## Rationale

The lib is shipped via `dist/data-wrapper.js` and the package is set up for
import (`"main"`, `"module"`, `"exports"` all point at the build), but the
metadata around it is thin. A public beta published to npm should include the
fields consumers expect: repository, homepage, bugs, license, full keyword list.

A CHANGELOG is intentionally deferred while the project is still in research
mode. Add one before the first stable release cadence, not before this 0.1 beta.

## Scope

- `package.json`:
  - add `repository`, `homepage`, `bugs` URLs
  - expand `keywords` beyond the current short list
  - add `author` and confirm `license: MIT`
  - confirm `"files": ["dist"]` is the intended publish surface (it is)
  - do not add `"sideEffects": false` to the current entry; importing it
    registers `<data-wrapper>`
  - keep `version` at `0.1.0` for the first public beta
- Add `LICENSE` file at project root (MIT, full text, correct year).
- Verify `dist/data-wrapper.js` (ESM) and `dist/data-wrapper.min.js` (IIFE)
  both load standalone from a script tag in a fresh HTML file.
- Run `npm pack --dry-run` and confirm the published tarball contains only
  intended files (no `archive/`, `tickets/`, `views/`, `state/`, source `.ts`
  files, etc.).

## Progress

Done:

- `package.json` is set to `version: "0.1.0"` for the first public beta.
- `author`, `license: "MIT"`, expanded `keywords`, dist entry fields, and
  `"files": ["dist"]` are in place.
- The root `LICENSE` file exists with the full MIT text and the 2026 copyright.
- The framework guide has had an accuracy and readability pass for public docs.
- The technical info page exists at `info.html`, with views for package
  metadata, download size, browser compatibility, public API surface, and
  release checks.
- The CSS release polish pass is complete: reset/base styles are tighter,
  component-specific CSS has moved next to the views it styles, shared docs
  chrome lives in `src/css/docs.css`, and global hover/text-wrap defaults no
  longer cause avoidable warnings or layout shifts.

Pending:

- Add `repository`, `homepage`, and `bugs` to `package.json` once the public
  remote / homepage URLs are known.
- Validate `package.json` with `npm pkg get`.
- Run `npm pack --dry-run` and confirm the tarball contains only
  `dist/`, `package.json`, `README.md`, and `LICENSE`.
- Smoke test both published artifacts from fresh HTML:
  `dist/data-wrapper.js` as ESM and `dist/data-wrapper.min.js` as a classic
  script.
- Do a browser smoke pass for the public docs and showcase pages.

## Non-Goals

- No semver policy document.
- No `CHANGELOG.md` until there is a real release cadence.
- No release automation / GitHub Actions.
- No publish-to-npm in this ticket.
- No TypeScript declaration output (`dist/data-wrapper.d.ts`) — that's a
  separate decision about whether we ship types, which depends on whether
  the public `engine.ts` / `component.ts` exports stabilize first.

## Acceptance

- `npm pack --dry-run` lists only `dist/`, `package.json`, `README.md`,
  `LICENSE`.
- `package.json` validates (`npm pkg get`).
- A fresh HTML file with `<script src="dist/data-wrapper.min.js"></script>`
  and a `<data-wrapper>` element renders correctly without any other setup.
