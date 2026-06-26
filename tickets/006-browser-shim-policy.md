# Ticket 006: Browser Support and Import Shim Policy

## Goal

Document and stabilize the browser support contract for runtime import maps and
the optional `es-module-shims` fallback.

## Rationale

The architecture relies on runtime import-map registration for loader-linked
component modules. Browser support is improving but uneven. The project already
supports a conditional `data-shim-src` fallback; before 1.0 this policy should
be explicit.

## Scope

- Document supported browser expectations.
- Document the `data-shim-src` contract on the framework script.
- Clarify when the shim is loaded:
  - native import attempted first
  - shim loaded only on module resolution failure
  - author code still uses normal `import` syntax
- Decide whether the project recommends a CDN URL, vendoring, or user-supplied
  shim hosting.

## Non-Goals

- No bundled shim in core.
- No service worker module resolver.
- No server-side canonical JS module route.
- No transpilation/build step.

## Acceptance

- README explains how to configure the shim.
- The core library remains small and does not load the shim for native-support
  browsers.
- Unsupported browsers fail with a clear message if no shim is configured.
- The documented contract matches current loader behavior.
