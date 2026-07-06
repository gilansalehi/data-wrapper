# Ticket 014: 0.1.0 Go-Live Checklist

## Goal

Publish `data-wrapper@0.1.0` as the first public beta package.

This ticket is the final operational checklist. Design, docs, security posture,
CSS polish, and package-size work are considered ready unless a preflight step
finds a concrete bug.

## Current Status

Final local preflight is green. The package is versioned as `0.1.0`, licensed
MIT, builds to `dist/`, publishes only the intended package surface, and the
packed tarball installs into a separate temporary project.

Known external blockers:

- No git remote is configured locally, so `repository`, `homepage`, and `bugs`
  cannot be filled without choosing the public project URL.
- npm auth is not active yet. `npm whoami` returns `ENEEDAUTH`; run
  `npm adduser` / `npm login` on the publishing machine before publish.
- Final browser smoke checks need to be confirmed by a real browser pass.

## Go-Live Checklist

### 1. Final Local Preflight

- [x] `bun run review` passes.
- [x] `bun report` passes and updates `views/info/size.html`.
- [x] `npm pkg get` validates the package metadata.
- [x] `npm pack --dry-run` lists only the intended publish surface.
- [x] `npm pack` can create a tarball that installs into a separate project.
- [x] A separate project can `import "data-wrapper"` from the packed tarball.

### 2. Dist Smoke

- [x] `dist/data-wrapper.js` loads as ESM from a fresh DOM smoke.
- [x] `dist/data-wrapper.min.js` loads as a classic script from a fresh DOM smoke.
- [x] A minimal `<data-wrapper src="...">` view renders through each artifact.
- [ ] `dist/data-wrapper.js` loads as ESM from a fresh browser HTML file.
- [ ] `dist/data-wrapper.min.js` loads as a classic script from a fresh browser
  file.
- [ ] A minimal `<data-wrapper src="...">` view renders through each artifact in
  a real browser.

### 3. Public Site Smoke

- [ ] Home page renders and the landing demos work.
- [ ] Framework guide renders all sections in the intended order.
- [ ] Technical info page renders all sections.
- [ ] Security section matches the current runtime contract.
- [ ] Theme toggle, docs nav, source peeks, todos, orders, and formatter demos
  work in the browser.

### 4. Package Metadata

- [x] `version` is `0.1.0`.
- [x] `license` is `MIT`, with a root `LICENSE` file.
- [x] `author`, `description`, `keywords`, entry points, and `"files": ["dist"]`
  are set.
- [ ] `repository`, `homepage`, and `bugs` point at the public project URLs.
- [ ] npm auth is ready on the publishing machine.

### 5. Publish

- [ ] Publish the beta with `npm publish --tag beta`.
- [ ] Verify install by tag:
  `npm install data-wrapper@beta`.
- [ ] Verify install by exact version:
  `npm install data-wrapper@0.1.0`.
- [ ] Verify a separate project can import the published package and register
  `<data-wrapper>`.

## Commands

```sh
bun run review
bun report
npm pkg get name version description license author keywords main module exports files
npm pack --dry-run
npm pack
npm publish --tag beta
```

Note: local npm cache permissions can block `npm pack` on this machine. The
successful preflight used `--cache /private/tmp/datacomponents-npm-cache` to
avoid mutating `~/.npm`.

## Non-Goals

- No new framework features.
- No changelog until there is a real release cadence.
- No release automation for this beta.
- No TypeScript declaration output for this beta.
- No strict CSP / Trusted Types tier for this beta.

## Acceptance

- All final local preflight checks pass.
- The dist artifacts pass browser smoke checks.
- Required public package metadata is present.
- The beta is published to npm and can be installed in a separate project.
