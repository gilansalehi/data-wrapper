# Ticket 010: Reserved Binding Syntax and Parser Surface

## Goal

Clarify which binding string forms are supported, reserved, or removed before
1.0.

## Rationale

The binding parser still exposes fields for path, relative lookup, params,
host, and protocol. Current architecture only relies on:

```txt
bare name
./relative
?params
```

Absolute paths, hosts, and protocol-style addressing are legacy/reserved
surface area. The docs and code should not imply support the framework does
not intend to provide.

## Scope

- Inventory supported binding forms.
- Decide what happens for:
  - `/path`
  - `//host/path`
  - protocol-like values
  - `../path`
- Rename internal parser terms if useful.
- Ensure unsupported forms fail clearly or remain no-ops intentionally.

## Non-Goals

- No cross-wrapper addressing implementation.
- No parent-row syntax unless Ticket 008 accepts it.
- No new parser package.
- No breaking changes to current bare/relative/query syntax.

## Acceptance

- README documents supported and reserved binding forms.
- Internal comments do not frame reserved branches as active features.
- Unsupported forms have predictable behavior.
- Current examples continue to use only supported forms.
