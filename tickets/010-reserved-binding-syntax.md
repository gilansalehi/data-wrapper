# Ticket 010: Reserved Binding Syntax and Parser Surface

**COMPLETED.**

## Goal

Clarify which binding string forms are supported, reserved, or removed before
1.0.

## Rationale

The binding parser still exposes fields for path, relative lookup, params,
host, and protocol. Current architecture relies on:

```txt
bare name
./relative
../parent
/root
//id/root
?params
```

The `/root` form is the component/root-scope escape hatch. The `../parent` form
addresses outer row scopes. Ticket 009 adds `//id/root` as an explicit
cross-wrapper read from another loaded wrapper's component scope. Protocol-style
addressing remains legacy/reserved surface area. The docs and code should not
imply support the framework does not intend to provide.

## Scope

- Inventory supported binding forms.
- Decide what happens for:
  - protocol-like values
- Rename internal parser terms if useful.
- Ensure unsupported forms fail clearly or remain no-ops intentionally.

## Non-Goals

- No new parser package.
- No breaking changes to current bare/relative/query syntax.

## Acceptance

- README documents supported and reserved binding forms.
- Internal comments do not frame reserved branches as active features.
- Unsupported forms have predictable behavior.
- Current examples use only supported forms: bare names, `./row`, `../parent`,
  `/root`, `//id/root`, and query params.

## Decision

Supported binding forms are:

```txt
name
./name
../name
/name
//id/name
name?formatter
```

Protocol-prefixed values such as `localStorage://key` remain reserved for
future custom resolvers. They are intentionally inert today across `$`, `*`,
`@`, and child `src` inputs: no static literal fallback, no parsed-path event
dispatch, no directive updater, and no prop value.
