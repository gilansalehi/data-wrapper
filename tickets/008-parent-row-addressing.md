# Ticket 008: Parent Row Addressing

## Goal

Decide whether and how bindings inside nested list contexts can address parent
row data.

## Rationale

The binding context chain now supports arbitrary nested rows, but author syntax
only exposes the nearest row:

```txt
./name
```

Some nested templates will eventually need outer row data. This needs a clear
syntax and resolution rule before it becomes an ad hoc feature.

## Scope

- Evaluate parent-row syntax options:
  - `../name`
  - `../../name`
  - named row aliases
  - explicit module/computed projections instead
- Decide whether parent-row addressing belongs in 1.0.
- If implemented, keep lookup lexical and deterministic.

## Non-Goals

- No cross-wrapper lookup.
- No CSS-selector-like DOM traversal.
- No implicit access to child wrapper internals.
- No dynamic scope mutation.

## Acceptance

- Either parent-row addressing is explicitly reserved, or a syntax is chosen
  and implemented.
- Nested list behavior remains deterministic.
- Nearest-row `./name` semantics remain unchanged.
- README documents the decision.

## Decision

Ticket 008 chooses and implements lexical parent-row addressing:

```txt
../name       -> parent row only
../../name    -> grandparent row only
```

Each `../` segment skips one row scope. The remaining path resolves against
that target row only; it does not continue climbing and it does not fall through
to the component runtime. If the targeted row does not exist or does not own the
first path segment, the binding follows the normal row-addressing miss policy
for `$`/`*`: render the static literal path and warn.

Unchanged rules:

```txt
./name        -> nearest row only
name          -> nearest row, outer rows, then component runtime
/name         -> component/root scope only
//host/name   -> still reserved/inert
```
