# Post-Alpha Roadmap

Fast-follows after the alpha release. These are not required before publishing
the first npm package, but they are the next places to invest once the package
can be consumed from another project.

## Security

- Configurable source policy for trusted origins and same-origin path prefixes.
  Alpha is same-origin-only for `<data-wrapper src>`.
- UGC-safe rendering story: sanitization guidance, safe raw-HTML policy, and
  tests against hostile content.
- Third-party component loading, if it becomes a real use case.
- CSS-injection hardening for hostile content.
- Trusted Types compatibility with `require-trusted-types-for 'script'`.
- Strict-CSP-compatible authoring mode, likely with external component modules
  and a nonce or static import-map story.

## Runtime

- SVG binding support, replacing the current "skip SVG descendants" behavior.
- Lifecycle events for post-wake DOM setup, such as `@wake` or `@dw:wake`, if a
  real component needs chart/editor/observer setup.
- Revisit blob module URL lifetime if module churn becomes a real scenario.
- Consider an explicit controlled-input shorthand only after repeated usage
  proves the ordinary `@input` + `$value` pattern is too verbose.

## Package And Docs

- TypeScript declaration output once the public TypeScript surface is stable.
- Generated technical info page data for package metadata, public exports, and
  size reports.
- Changelog and release cadence once there are real published releases.
- Browser smoke coverage for built dist artifacts and public examples.

## Test Hygiene

- De-duplicate shared test helpers across the contract test files.
- Keep tests contract-focused so internal refactors can continue without
  rewriting implementation-coupled assertions.
