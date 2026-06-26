# Ticket 013: Restore Common Formatters

## Goal

Re-add the most-used built-in formatters that were removed during the
component-module pivot.

## Rationale

`DW_FORMATTERS` currently ships with only `onoff`. Every non-trivial component
reaches for at least one of: `currency`, `date`, `count` (array length),
`upper`, `lower`, `trim`. Today the dev writes a computed export to do
formatting that should be a one-token pipeline param, which fights the "three
tokens, no script" pitch the README opens with.

These formatters were present in earlier iterations and got dropped as part
of the slop cleanup. Bringing back a small, conservative set restores the
binding sugar without re-introducing the surface that was rightly trimmed.

## Scope

- Add to `DW_FORMATTERS` in `engine.ts`:
  - `currency` — `Intl.NumberFormat` with USD default
  - `date` — `toLocaleDateString` for date-like inputs
  - `count` — `length` for arrays and strings
  - `upper` — `toUpperCase` with null-safety
  - `lower` — `toLowerCase` with null-safety
  - `trim` — `String.prototype.trim` with null-safety
- Each formatter accepts a single value and returns a formatted result.
- Document the full formatter set in the README (per ticket 012).
- Keep formatters small and dependency-free; they should be readable in
  one line each.

## Non-Goals

- No locale argument support (USD/en-US is the default; advanced needs go
  through a dev-registered formatter).
- No `relativeTime` / `ago` formatter (debatable correctness, varies by app
  needs).
- No formatter argument syntax beyond what `onoff` already supports.
- No new categories of binding pipeline behavior.

## Acceptance

- All six formatters are usable as `$text="key?currency"` etc.
- Each formatter handles null/undefined input without throwing.
- README's formatter list matches the shipped set.
- Bundle size growth is under 500 bytes minified (these are small).
