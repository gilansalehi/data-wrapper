# RFC: Symmetric `Source` + `put:` write protocol

**Status:** Draft — awaiting approval.

## Motivation

Two problems, one design. The verbose controlled-input pattern (`$value` +
`name=` + `@change=` + registered handler — see `views/showcase/todos.html`
line 10) is the user-facing symptom. The asymmetric `BindingSource` — where
state-channel sources have no explicit `write` because writes implicitly
route through `wrapper.put` — is the internal cause. Fixing the asymmetry
makes the controlled-input one-liner fall out, because the write side of
every binding becomes uniformly addressable.

The two halves are coupled. The new feature builds on the cleaner abstraction;
the cleaner abstraction earns its keep partly by making the feature trivial.
Same RFC.

## Part 1 — Engine cleanup

### §1. Symmetric `Source`

Replace `BindingSource` with `Source`:

```ts
type Source = {
    read:      () => unknown;
    write:     (v: unknown) => void;
    subscribe: (cb: Sub) => Off;
    escapes:   boolean;
};
```

`subscribe` keeps its existing role as the read-side stream. `read` is a
one-shot value getter (mainly for symmetry; internal callers rarely need it
since `subscribe` fires once initially). `write` is total — state-channel
sources gain an explicit write that calls `target.put(path, v)`, removing
the implicit-write asymmetry that forces wire() to special-case bidirectional
bindings at engine.ts:478.

### §2. Generalized `Source` via a default handler

The brittle nested branching today (default protocol vs. handler protocol,
then row-scoped vs. wrapper-scoped within default) collapses once we
recognize the framing: **every source is built from a handler, and the
default `dwrl:` protocol is itself a handler.** It happens to read and write
the wrapper's dataset rather than an external backend like
`localstorage://`, but the shape is the same.

`Handler` becomes the canonical extension type. `DW_PROTOCOLS` carries
non-default handlers; the default handler is built in and used as a fallback
when no protocol entry matches:

```ts
type Handler = {
    read:      (dwrl: pURL, ctx: { wrapper, row }) => unknown;
    write:     (dwrl: pURL, v: unknown, ctx: { wrapper, row }) => void;
    subscribe: (dwrl: pURL, cb: Sub, ctx: { wrapper, row }) => Off;
};

const DEFAULT_HANDLER: Handler = {
    read: (dwrl, { wrapper, row }) => {
        const scoped = row && dwrl.isRel;
        return readPath(scoped ? row.item : wrapper.state, dwrl.path);
    },
    write: (dwrl, v, { wrapper, row }) => {
        const scoped = row && dwrl.isRel;
        if (scoped) {
            /* identity-keyed immutable update against the parent array */
        } else {
            wrapper.put(dwrl.path, v);
        }
    },
    subscribe: (dwrl, cb, { wrapper, row }) => {
        const scoped = row && dwrl.isRel;
        const station = scoped ? row.subs : wrapper._subs;
        const state   = scoped ? row.item : wrapper.state;
        return subscribe(station, dwrl.path, cb, readPath(state, dwrl.path));
    },
};

const resolve = (dwrl: pURL, ctx: { wrapper, row }): { source: Source } | null => {
    const handler = DW_PROTOCOLS.get(dwrl.protocol.slice(0, -1)) ?? DEFAULT_HANDLER;
    const source: Source = {
        read:      ()   => handler.read(dwrl, ctx),
        write:     (v)  => handler.write(dwrl, v, ctx),
        subscribe: (cb) => handler.subscribe(dwrl, cb, ctx),
        escapes:   /* computed from ctx — same logic as today */,
    };
    return { source };
};
```

One source type. One `resolve`. Handlers (default or registered) provide all
the backend-specific logic. The row-scoping logic lives inside the default
handler's closures — no other handler cares about rows, so it doesn't need
to be hoisted into `resolve()` itself.

New protocols register handlers in `DW_PROTOCOLS` and gain row-context-aware
behavior for free (or ignore the row in ctx, as `localstorage://` does).

### §3. `$data-*` writeback collapses

The special case at engine.ts:478 today reads:

```ts
if (source.write && el === wrapper && prop.startsWith('data-')) {
    const dsKey = ...;
    subscribe(wrapper._subs, dsKey, source.write, readPath(wrapper.state, dsKey));
}
```

The `source.write &&` guard exists because `BindingSource.write` is optional
today — only protocol-handler sources have it. Under symmetric `Source`, every
source has `write`, so the guard becomes redundant. The branch shrinks to:

```ts
if (el === wrapper && prop.startsWith('data-')) {
    const dsKey = ...;
    subscribe(wrapper._subs, dsKey, source.write, readPath(wrapper.state, dsKey));
}
```

The `el === wrapper && prop.startsWith('data-')` check stays — not every
`$`-binding should bidirectionally sync; that's the auto-writeback question
we deliberately set aside in favor of explicit `@event="put:..."`.

### §4. Drop `wakeOwned`

Independent cleanup, but lives in the same RFC because it touches the same
files. The `wakeOwned` indirection in `listDirective` (engine.ts:199) and the
`wake` parameter on `reconcile` (engine.ts:141) save one
`closest('data-wrapper')` per row and nothing else. Rows are in the DOM by
wake time — `reconcile` appends the fragment at engine.ts:178 before the wake
loop at line 179 — so `wake`'s default
`wrapper = root.closest('data-wrapper')` resolves correctly. Drop the
parameter, drop the indirection, let the default work. Same for
`showEmpty`'s `wakeOwned(emptyNode)` call.

## Part 2 — JS-free write via `put:` protocol

### §5. `put:` as a write protocol on `@` attributes

The `@` branch in `wire()` (engine.ts:431-454) parses a pURL but uses only
the path (as event name) and a small subset of query params (`prevent`,
`stop`, `immediate`). The protocol slot has been unused. This RFC reserves
`put:` as a write-direction protocol on `@`.

When the `@` value parses with `protocol === 'put:'`, wire dispatches `put:`
as the event name (literal, including the colon), with the parsed `path` and
an extracted value carried in the detail. The wrapper auto-registers a `put:`
listener that does the write.

**One-line change** at engine.ts:449:

```ts
// before:
emit(path, detail, sink);

// after:
emit(protocol === 'dwrl:' ? path : protocol, detail, sink);
```

Detail gains one field:

```ts
const detail: DispatchDetail = {
    originalEvent: e,
    payload: collectPayload(el),     // existing — element-aware fix in §6
    path,                            // NEW — parsed pURL path
};
```

The `put:` listener extracts the right value from the payload based on the
path's leaf segment (§7), so no separate `value` field is needed. Tying
extraction to path semantics keeps the detail shape minimal and reuses the
existing payload pipeline for both legacy callbacks and the new put: case.

**Cross-wrapper writes fall out of existing host resolution.**
`@change="put://other-wrapper/message"` parses with `host="other-wrapper"`;
`resolveHost` (engine.ts:356-362) routes the dispatch to that wrapper; its
own `put:` listener handles the write against its state. Zero new code.

**Legacy topic-emit is unchanged.** `@click="todo/add"` still parses with
`protocol="dwrl:"`, emits `"todo/add"`, and any registered handler fires as
today.

### §6. Minimal element-aware `collectPayload`

`collectPayload` (engine.ts:326-339) has two bugs that matter once payloads
drive writes:

1. **For checkboxes**, `el.value` is the `value=""` attribute (default
   `"on"`), not the boolean checked state. State for a checkbox-bound key
   becomes a meaningless string.

2. **For `<select multiple>`**, `el.value` is only the first selected
   option's value — multi-selection is lost. The form branch via `FormData`
   also implements HTML form-submit semantics where unchecked checkboxes are
   omitted entirely; fine for server submission, wrong for tracking state
   continuously.

Two minimal special cases in extraction — the only places `el.value` is
genuinely wrong. Everything else (text, number, range, date, radio) works
correctly with `el.value`: the dataset JSON-serializes on write and parses on
read, so `"42"` round-trips as `42`, `"true"` as `true`, etc. Further type
conversion is the formatter system's job (see §8.5), not `collectPayload`'s.

```ts
const elementValue = (el: Element): unknown => {
    const i = el as HTMLInputElement;
    if (i.type === 'checkbox')                          return i.checked;
    if (el instanceof HTMLSelectElement && el.multiple) return [...el.selectedOptions].map(o => o.value);
    return (el as HTMLInputElement | HTMLTextAreaElement).value;
};

const collectPayload = (el: Element): DispatchPayload => {
    if (el instanceof HTMLFormElement) {
        const out: DispatchPayload = {};
        for (const child of el.elements) {
            const c = child as HTMLInputElement;
            if (!c.name) continue;
            if (c.type === 'radio' && !c.checked) continue;   // only the checked radio in a group
            out[c.name] = elementValue(c);
        }
        return out;
    }
    const ni = el as HTMLInputElement;
    return ni.name ? { [ni.name]: elementValue(ni) } : {};
};
```

This is the minimum element-aware logic: two cases, encoded once, called from
both branches of `collectPayload`. The shape of `collectPayload`'s output is
unchanged (`{name: value}` for single inputs, multi-key object for forms),
so legacy callback handlers continue to destructure as before — but values
arrive with the right type without the consumer doing string parsing.

### §7. Wrapper auto-registers `put:` listener

`DataWrapper.connectedCallback` registers one listener:

```ts
on('put:', (e) => this.handlePut(e as CustomEvent), '', this);
```

`handlePut` extracts the right value from the payload based on the path's
leaf segment, then resolves a Source and writes:

```ts
handlePut(e: CustomEvent) {
    const { path, payload } = e.detail;
    const leaf  = path.split('/').pop()!;
    const value = (payload as Record<string, unknown>)[leaf] ?? payload;
    const row   = /* TBD — see §8.1 */;
    const r     = resolve(p(path), { wrapper: this, row });
    if (!r) return;
    r.source.write(value);
}
```

The extraction rule — "value is `payload[leaf]` if defined, otherwise the
whole payload" — ties put semantics to the path. Three cases land naturally:

- **Single named input.** `<input name="done" @change="put:./done">` —
  `payload = { done: true }`, leaf = `"done"`, `value = true`.
  `source.write(true)` → row's `done` field updates.
- **Form, multi-key payload.** `<form @submit="put:/draft?prevent">` with
  `name="task"`, `name="priority"` — `payload = { task, priority }`,
  leaf = `"draft"`, no `"draft"` key in payload, falls through to
  `value = payload`. `source.write({ task, priority })` →
  `state.draft = { task, priority }`.
- **Named button.** `<button @click="put:/filter" name="filter" value="active">` —
  `payload = { filter: "active" }`, leaf = `"filter"`, `value = "active"`.
  `state.filter = "active"`.

`name=` on the firing element is the **participation flag for `put:`** in
exactly the way it is for HTML form submission: a control without `name=`
contributes nothing to the harvest, so payload is empty, leaf-lookup fails,
and the listener writes `{}` over the target — almost certainly a user error.
Documented; not silently bridged.

The Source's symmetric `write` (§1-§2) handles wrapper-scoped writes
(`wrapper.put(path, value)`) and row-scoped writes (identity-keyed immutable
array update) at the same call site — the listener doesn't branch.

## §8. Open questions

1. **Row resolution mechanism.** The `put:` listener needs a `Row` reference
   when the firing element is inside a `*list` row, so the state-channel
   source's row-scoped write fires. Three sketches in play:
   - **DOM attribute markers** set by `reconcile` (`_row` + `_row-id`) plus a
     listCache walk to find the `Row` object from the rowNode.
   - **WeakMap** on the wrapper mapping `rowNode → Row`, populated by
     `reconcile`.
   - **Inline the row-scoped write directly in the listener** (skipping
     `Source.write` for the row case) — works but asymmetric with the
     wrapper case.

   Each has trade-offs; deferring until the rest of the RFC is locked.

2. **Single-key vs multi-key payloads for `put:`.** For
   `<form @submit="put:/draft?prevent">` with multiple named inputs,
   `collectPayload(form)` returns a multi-key object; the §7 extraction
   rule falls through to writing the whole object at `/draft` (replacing).
   Is replacement the right default for `put:` on a form, or should the
   form case use patch semantics (merge)? The answer affects whether `put:`
   on a form is a useful primitive on its own (independent of the eventual
   `patch:` protocol).

3. **`name=` as participation flag.** §7 documents that `name=` is required
   for `put:` writes to harvest anything — without it, payload is empty and
   the listener writes `{}`. This mirrors HTML form-submit semantics. Worth
   confirming the behavior is intentional vs. silently routing `el.value`
   for nameless single inputs.

4. **URL parsing.** Verified: `put:./done`, `put:/done`, `put:done`, and
   `put://host/done` all parse cleanly with the existing `pURL()`. No
   parser changes needed.

5. **Formatters on write-direction `@` pURLs.** Formatters today are
   read-side only — `$value="/path?format=upper"` runs the read value
   through the formatter pipeline. Extending the pipeline to `@`-write
   pURLs — e.g. `@change="put:./done?format=bool"` running el.value through
   a bool formatter before `source.write` — would offer per-binding type
   conversion and could potentially shrink §6's `elementValue` further
   (the checkbox case might be absorbable as a default-mapped formatter).
   Out of scope for this RFC but flagged as the natural next step that
   touches the same code path.

## Migration

User-facing:
- **Opt-in two-way binding** via `@event="put:/path"`. Read-only `$value` /
  `$checked` plus `@event="topic/name"` callbacks continue to work bit-for-bit.
- **No syntax changes** to `$`, `*`, `@` tokens, pURL grammar, or `name=`
  semantics.
- **Cross-wrapper writes via `put://other-wrapper/path`** — existing host
  resolution does the routing.

Framework-internal:
- `BindingSource` → `Source`, symmetric (read/write/subscribe total).
- `resolve()` collapses to one path: look up handler (`DW_PROTOCOLS` or
  `DEFAULT_HANDLER`), wrap its three methods as Source closures. Row-scoping
  logic lives inside the default handler.
- engine.ts:478 simplifies — `source.write &&` guard becomes redundant
  (every source now has total `write`).
- engine.ts:449 one-line change for protocol-as-event-name.
- `collectPayload` rewritten with minimal element-aware extraction (two
  cases: checkbox, multi-select). Existing callback handlers that did
  `Number(e.detail.payload.id)` or `e.detail.payload.done === 'on'`
  simplify — values arrive with the right type for these two cases.
- `elementValue` added as a private helper inside engine.ts.
- `DispatchDetail` gains `path`. No new `value` field.
- `DataWrapper.connectedCallback` registers the `put:` listener.
- `wakeOwned` removed from `listDirective`; `wake` parameter removed from
  `reconcile`.

No user-facing semantic regressions expected.

## Non-goals

- **No `push:`, `pull:`, `patch:` protocols yet.** Reserved by name and
  convention; implementation deferred until `put:` proves out.
- **No new sigils, attributes, or pURL grammar changes.**
- **No auto-writeback via `$value` + `name=` detection.** The protocol-based
  design supplants the earlier auto-writeback proposal. `$` is read-only
  direction; `@event="put:..."` is the explicit write trigger.
- **No `DW_BINDINGS` registry.** Element-aware extraction lives in
  `elementValue` as a fixed two-case function, not an extension point. Lift
  to a registry only if a real need surfaces — and if formatter-on-write
  (§8.5) lands first, even this function may shrink.
- **No formatter-on-write yet.** Flagged in §8.5 as the natural follow-up.
- **No cycle detection** for graphs introduced by `put:` writes — roadmap.
- **No batching or async flush.** Per-keystroke fan-out is acceptable; users
  hit by perf opt to `@change` over `@input`.

## Acceptance criteria

When implemented:

- `views/showcase/todos.html` line 10 collapses from
  ```html
  <input type="checkbox" $checked="./done" @change="todo/toggle"
         name="id" $value="./id" aria-label="...">
  ```
  to
  ```html
  <input type="checkbox" $checked="./done" name="done"
         @change="put:./done" aria-label="...">
  ```
  `name="done"` participates in the put: harvest so the listener finds
  `payload.done` at the path leaf. If `status` moves to a render-time
  derivation (e.g., `$class="./done?format=onoff=done:active"`), the
  `todo/toggle` registered handler can be deleted entirely.

- The `filter/set` registered handler dissolves:
  ```html
  <button @click="put:/filter" name="filter" value="active">Active</button>
  ```
  `name="filter"` is required so the button's value is harvested into
  `payload.filter`; the path leaf `filter` then extracts it.

- `<form @submit="put:/draft?prevent">` with named inputs writes the
  multi-key payload as a single object at `/draft` (pending §8.2 — may
  become a patch on follow-up).

- Cross-wrapper writes via `put://#other-wrapper/path` route through
  existing host resolution.

- All existing demos and unit tests continue to pass. The `collectPayload`
  type-coercion change is verified across the suite.

- `FRAMEWORK.md` documents `put:` as a write-direction protocol alongside
  the existing `$` / `*` / `@` token table.
