# RFC: Binding Context Chains for Nested Rows

## Status

Proposed.

## Summary

Replace the current `wrapper + row?` binding model with an explicit binding
context chain:

```txt
root wrapper context -> 0 or more row contexts -> binding effects -> DOM
```

This preserves the existing component module architecture:

- `ComponentRuntime` remains the root component binding surface.
- `Row` remains the keyed list item record.
- `Source` remains the resolved readable/subscribable value.
- `$`, `*`, and `@` bindings keep their current author-facing syntax.

The change is internal. It allows nested lists to compose to arbitrary depth
without replacing or losing the surrounding row context.

## Motivation

The current engine passes an optional `row` through `wake()` and `wire()`:

```ts
wake(root, row?, wrapper?)
wire(el, attr, row?, wrapper?)
```

That works for a single list level:

```txt
wrapper -> row -> binding
```

But it cannot faithfully represent nested list contexts:

```txt
wrapper -> outer row -> inner row -> binding
```

The framework is converging on a module-first component model:

- shared state lives in ES module exports
- per-wrapper bindings live in the optional default factory return value
- list items create nested template contexts
- bindings resolve against the context where their DOM node is woken

The engine needs to make that context chain explicit.

## Non-Goals

This RFC does not add:

1. A new lifecycle API.
2. A public `props` surface.
3. Dynamic `src` behavior.
4. Cross-wrapper lookup.
5. Parent-row syntax such as `../name`.
6. A rename of `Row`.
7. A rewrite of the module loader.
8. A new reactivity system.
9. Block-local cleanup for `*if` clones.

## Terms

### Component Runtime

`ComponentRuntime` is the binding surface for a mounted wrapper. It resolves:

```txt
bare name -> per-wrapper instance binding, then module named export
```

It owns component-level subscriptions, action listeners, and output cache.

### Row

`Row` is the keyed runtime record for one rendered item in a `*list`.

Current shape:

```ts
type Row = {
  node: Element;
  item: Item;
  subs: Station;
  unsubs: Off[];
};
```

Its job is keyed identity plus item-relative binding publication.

### Source

`Source` is the resolved binding input:

```ts
type Source = {
  read: () => unknown;
  subscribe: (cb: Sub) => Off;
  escapes: boolean;
};
```

This RFC does not change the `Source` concept.

### BindingRef

`BindingRef` is the parsed form of an attribute binding string. It is the
internal parser output that carries the fields resolution and formatting need:

```ts
type BindingRef = {
  path: string;
  isRel: boolean;
  params: URLSearchParams;
  host: string;
  protocol: string;
};
```

This RFC only uses `path`, `isRel`, and `params`. `host` and `protocol` remain
reserved for future addressing features.

### Binding Context

A binding context is the runtime position of a DOM node within a wrapper and
zero or more nested list rows.

Proposed shape:

```ts
type BindingContext = {
  root: Wrapper;
  current: Row | null;
  parent: BindingContext | null;
};
```

The type is deliberately named `BindingContext`, not plain `Context`, because
the project already has `ComponentContext` for default factory initialization.
Local variables should still use the terse name `ctx`.

Root context:

```ts
{ root: wrapper, current: null, parent: null }
```

Row context:

```ts
{ root: parent.root, current: row, parent }
```

This is a linked chain rather than an array so nested contexts can be created
cheaply and parent traversal can be added later without changing the structure.
`current` is the row introduced at this context node. Helpers such as
`nearestRow(ctx)` should walk `ctx`, then `ctx.parent`, until they find a row.

## Binding Resolution

For this RFC, resolution remains intentionally small.

```txt
bare name -> ctx.root._component
./path    -> nearest ctx.current
```

Examples:

```html
<output $text="count"></output>
```

resolves `count` from the wrapper's component runtime.

```html
<span $text="./task"></span>
```

resolves `task` from the nearest list item context.

Nested lists work because the inner list pushes another context:

```txt
[component]
[component, order row]
[component, order row, line row]
```

Inside the innermost row, `./sku` resolves from the line row.

## Proposed API Changes

### Engine Signatures

Current:

```ts
wake(root, row?, wrapper?)
wire(el, attr, row?, wrapper?)
```

Proposed:

```ts
wake(root, ctx)
wire(el, attr, ctx)
```

Small helpers should keep call sites readable:

```ts
const rootContext = (wrapper: Wrapper): BindingContext => ({
  root: wrapper,
  current: null,
  parent: null,
});

const childContext = (
  parent: BindingContext,
  row: Row,
): BindingContext => ({
  root: parent.root,
  current: row,
  parent,
});
```

### Directive Context

Directive handlers should receive the full binding context:

```ts
interface DirectiveContext extends BindingRef {
  ctx: BindingContext;
  el: Element;
  wake: (node: Element, ctx: BindingContext) => void;
}
```

Derived fields should not be carried permanently:

```txt
wrapper -> ctx.root
row     -> nearestRow(ctx)
```

This is a small breaking change for custom directives, but the custom directive
surface is still young and the clean shape is cheaper to lock in now. Directives
that need the wrapper or nearest row can use the same helpers as the built-ins.

## Implementation Plan

### 1. Add BindingContext

Add `BindingContext` and helpers to `engine.ts`.

Expected helpers:

```ts
rootContext(wrapper)
childContext(parent, row)
nearestRow(ctx)
ownerUnsubs(ctx)
own(ctx, off)
```

For this patch:

```ts
ownerUnsubs(ctx) =
  ctx.current ? ctx.current.unsubs : ctx.root._unsubs
```

`own(ctx, off)` should push `off` into `ownerUnsubs(ctx)`.

### 2. Update wake and wire

Change `wake()` and `wire()` to accept `BindingContext`.

`wake()` traverses DOM as before, but each element is wired under the provided
context.

`wire()` parses the attribute, resolves a `Source` from the context, and
creates the same DOM effect as today.

### 3. Move row lookup behind context resolution

Current row source:

```ts
rowSource(row, path)
```

can stay mostly unchanged. The only difference is that callers find the row
through `nearestRow(ctx)` instead of receiving a direct `row` argument.

Initial resolution:

```txt
bare name and component has binding -> component source
relative path and nearest row exists -> row source
otherwise -> null
```

### 4. Make list push a child context

`*list` currently reconciles rows and wakes new row nodes with one optional
row argument.

After this RFC, reconciliation receives the parent context. For every fresh
row:

```ts
wake(row.node, childContext(parentCtx, row));
```

Existing row update remains the same:

```ts
row.item = item;
for (const ch in row.subs) publish(row.subs, ch, readPath(item, ch));
```

### 5. Preserve row cleanup behavior

Bindings created under a row continue to register cleanup on that row.
Bindings created at wrapper root continue to register cleanup on the wrapper.
Implementation code should use `ownerUnsubs(ctx)` or `own(ctx, off)` rather
than reaching directly for `row.unsubs` or `wrapper._unsubs`.

This RFC does not introduce separate block owners or retained conditional
subtrees.

### 6. Ensure nested list caches clean up with their owner

Nested lists create caches inside row-owned DOM. When the owning row is removed,
the nested list rows must be unwired too.

`_listCache` stays on the wrapper. Pulling it into `BindingContext` would split
shared wrapper state across transient context nodes without improving the
author model.

The list directive should register a cleanup with the current owner by pushing
a normal `Off` into `ownerUnsubs(ctx)`. That cleanup should:

1. unwire every row in its cache
2. remove every row node
3. clear the cache
4. remove the cache from `wrapper._listCache`

This uses existing cleanup arrays. It is not a new lifecycle API.

### 7. Update if directive context forwarding

`*if` should wake cloned content with the full current context:

```ts
wake(live, ctx);
```

No new `IfFrame`, block context, or block-local cleanup owner is introduced in
this RFC.

This means the existing `*if` cleanup limitation remains explicit: when a
clone is removed, subscriptions created by that clone may live until the
nearest owning row or wrapper is disposed. That is already true today. Solving
it correctly requires a separate decision between retained blocks and
block-local cleanup ownership, so it should not be folded into the nested-row
context patch.

### 8. Update DataWrapper call sites

`DataWrapper.connectedCallback()` and `load()` should wake wrappers with a
root context:

```ts
wake(wrapper, rootContext(wrapper));
```

## Example

Component module:

```html
<script type="module" data-component data-module="@view/orders">
  export let orders = [
    {
      id: 1,
      customer: "Ada",
      lines: [
        { id: "a", sku: "PEN", qty: 2 },
        { id: "b", sku: "INK", qty: 1 },
      ],
    },
  ];
</script>
```

Template:

```html
<section>
  <template *list="orders">
    <article>
      <h3 $text="./customer"></h3>

      <ul>
        <template *list="./lines">
          <li>
            <span $text="./sku"></span>
            <span $text="./qty"></span>
          </li>
        </template>
      </ul>
    </article>
  </template>
</section>
```

Expected context chain:

```txt
orders binding:
  [component]

customer binding:
  [component, order row]

lines binding:
  [component, order row]

sku / qty bindings:
  [component, order row, line row]
```

## Compatibility

Existing single-level bindings should keep working:

```html
<output $text="count"></output>
<span $text="./task"></span>
```

Existing module semantics do not change:

- named exports are shared module bindings
- default factory return values are per-wrapper bindings
- instance bindings shadow module exports

Existing public row syntax does not change:

```txt
./name
```

## Corner Cases To Review

### Nested list removal

When an outer row is removed, any inner list caches created under that row must
be fully unwired. Otherwise subscriptions can keep detached DOM alive.

### Nested list reorder

When outer rows reorder, row DOM identity should be preserved by key. Inner row
caches should move with their outer row DOM, not be rebuilt due to array index.

### Same key under different lists

List caches are scoped by their template/container, so identical keys in
separate lists should not collide.

### Empty lists

When a list becomes empty, all row contexts created by that list should be
unwired and removed.

### Component actions inside rows

`@click="toggle"` inside a row should still activate the component action on
the root wrapper. The event detail should still include the nearest row item.
Implementation should compute that as:

```ts
item: nearestRow(ctx)?.item
```

### Relative event paths

`@click="./select"` currently emits the parsed path and row item. This RFC does
not assign new behavior to relative event paths.

### Root wrappers without component modules

`wake(rootContext(wrapper))` should still allow plain wrapper bindings that do
not depend on `_component`, though unresolved bare names remain no-ops.

### Reserved addressing branches

Absolute paths, hosts, and protocols remain reserved. This RFC only relies on:

```txt
path
isRel
params
```

## Resolved Decisions

1. Use `BindingContext` as the exported type name and `ctx` as the local
   variable name.
2. Keep the name `Row` for this patch.
3. Do not add parent-row syntax yet.
4. Include nested list cache cleanup.
5. Keep `_listCache` on the wrapper.
6. Do not add backward-compatible overloads for `wake()` or `wire()`.
7. Keep `DirectiveContext` small: parsed binding fields, `ctx`, `el`, and
   `wake`.
8. Leave block-local `*if` cleanup as an explicit existing limitation.

## Recommendation

Implement the smallest useful version:

1. Add `BindingContext`.
2. Convert `wake()` and `wire()` to consume it.
3. Make `*list` push row contexts.
4. Keep resolution rules unchanged except for arbitrary nesting.
5. Include nested list cache cleanup.
6. Do not add props, dynamic `src`, cross-wrapper lookup, parent-row syntax, or
   block-local `*if` cleanup.

This directly supports arbitrary nested rows while keeping the module-first
component architecture intact.
