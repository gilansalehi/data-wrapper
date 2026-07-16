# Ticket 014: 0.1.0 Go-Live Checklist

## Goal

Publish `data-wrapper@0.1.0` as the first public beta package.

This ticket is the final operational checklist. Design, docs, security posture,
CSS polish, and package-size work are considered ready unless a preflight step
finds a concrete bug.

## Current Status

Final local preflight is green as of 2026-07-09. The package is versioned as
`0.1.0`, licensed MIT, builds to `dist/`, publishes only the intended package
surface, and the packed tarball installs into a separate temporary project.

Latest local evidence:

- `bun run review` passes when Playwright is allowed to launch outside the
  sandbox. The sandboxed run failed at Chromium launch with
  `bootstrap_check_in ... Permission denied`, not with a test assertion.
- `bun run report` passes and updated `site/views/info/size.html`.
- `bun run site:check` passes across the deploy tree: 67 HTML files, 11 CSS
  files, 91 public files total.
- `npm pkg get ...` validates package metadata.
- `npm pack --dry-run --cache /private/tmp/datacomponents-npm-cache` lists only
  `LICENSE`, `README.md`, `package.json`, and the two dist artifacts.

Known external blockers:

- Cloudflare Pages needs to be connected to
  `https://github.com/gilansalehi/data-wrapper`.
- The custom domain needs to be attached to the Cloudflare Pages project.
- npm auth is not active yet. `npm whoami` returns `ENEEDAUTH`; run
  `npm adduser` / `npm login` on the publishing machine before publish.
- Final browser smoke checks need to be confirmed by a real browser pass.

## Go-Live Checklist

### 0. Public Site Deploy

- [x] Domain purchased: `data-wrapper.org`.
- [x] Canonical domain decision: `https://data-wrapper.org`.
- [x] `www.data-wrapper.org` should redirect or alias to the apex domain.
- [x] Cloudflare Pages deploy mode decision: Git-connected Pages project.
- [x] Cloudflare Pages project name decision: `data-wrapper`.
- [x] Public site root is `site/`.
- [x] Cloudflare Pages deploy is build-free: build command `exit 0`, output
  directory `site`.
- [x] Public site root excludes repo-private files such as tickets, tests,
  TypeScript source, tarballs, and collaboration notes.
- [x] `site/` passes `bun run site:check`.
- [x] Public GitHub repository exists.
- [x] Git remote is configured locally.
- [x] Current release branch is pushed to GitHub.
- [ ] Cloudflare Pages project exists for `data-wrapper`.
- [ ] Cloudflare Pages is connected to the GitHub repository.
- [ ] Cloudflare Pages build command is `exit 0`.
- [ ] Cloudflare Pages build output directory is `site`.
- [ ] `data-wrapper.org` is connected to the Cloudflare Pages project.
- [ ] `https://data-wrapper.org` serves the current site.
- [ ] `https://www.data-wrapper.org` redirects or aliases correctly.

### 1. Final Local Preflight

- [x] `bun run review` passes.
- [x] `bun report` passes and updates `site/views/info/size.html`.
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
- [ ] Examples gallery renders; source peeks and "open in playground" links
  work.
- [ ] Playground runs, resets, and surfaces an invalid-script error.
- [x] Theme Studio is delisted for alpha; `/theme-studio` remains in the repo
  as an unlinked work-in-progress for a later release.
- [ ] Security section matches the current runtime contract.
- [ ] Theme toggle, docs nav, source peeks, todos, orders, and formatter demos
  work in the browser.

### 4. Package Metadata

- [x] `version` is `0.1.0`.
- [x] `license` is `MIT`, with a root `LICENSE` file.
- [x] `author`, `description`, `keywords`, entry points, and `"files": ["dist"]`
  are set.
- [x] `homepage` points at `https://data-wrapper.org`.
- [x] `repository` points at the public GitHub repo.
- [x] `bugs` points at the chosen public support channel.
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
bun run site:check
npm pkg get name version description license author keywords main module exports files
npm pack --dry-run
npm pack
bun run site:serve
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
- No Theme Studio release commitment for this beta.

## Acceptance

- All final local preflight checks pass.
- The dist artifacts pass browser smoke checks.
- Required public package metadata is present.
- The beta is published to npm and can be installed in a separate project.
