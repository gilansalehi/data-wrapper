# Ticket 013: Restore Common Formatters

**COMPLETED.**

## Goal

Re-add the most-used built-in formatters that were removed during the
component-module pivot.

## Rationale

`DW_FORMATTERS` shipped with only `onoff`. Every non-trivial component reaches
for at least one of: currency, dates, count/length, text casing, trimming,
sorting, or fallback display. Today the dev writes a computed export to do
formatting that should be a one-token pipeline param, which fights the "three
tokens, no script" pitch the README opens with.

These formatters were present in earlier iterations and got dropped as part
of the slop cleanup. Bringing back a small, conservative set restores the
binding sugar without re-introducing the surface that was rightly trimmed.

## Scope

- Add consolidated static formatters to `DW_FORMATTERS` in `engine.ts`.
- Support formatter params on `$` bindings and `*` directive sources.
- Keep formatter arguments static for now; reactive formatter args are future
  source-dependency work.
- Document the full formatter set in the README and formatter docs.
- Keep formatters dependency-free and readable.

## Non-Goals

- No locale argument support (USD/en-US is the default; advanced needs go
  through a dev-registered formatter).
- No `relativeTime` / `ago` formatter (debatable correctness, varies by app
  needs).
- No reactive formatter arguments such as `?sort=sortKey`.
- No new categories of binding pipeline behavior.

## Acceptance

- Approved formatters are usable as `$text="key?currency"` and, where useful,
  `*list="items?sort=name"`.
- Each formatter handles null/undefined input without throwing.
- README's formatter list matches the shipped set.
- Bundle size remains within the ticket-015 budget.

## Shipped

Built-ins: `default`, `bool`, `case`, `trim`, `truncate`, `count`, `join`,
`sort`, `unique`, `number`, `fixed`, `percent`, `currency`, `date`, `time`,
`datetime`, and `json`.

`onoff` remains as a compatibility alias. New docs and examples use `bool`.
