# Ticket: Binding Context Chains for Nested Rows

Implements `RFC_BINDING_CONTEXT_CHAIN.md`. The RFC's *Resolved Decisions*
section is authoritative — this ticket is the file-level checklist.

## Scope

Replace the optional `row?` parameter threaded through `wake()` and `wire()`
with an explicit `BindingContext` linked-list chain so nested `*list`
templates can resolve `./path` against the correct row.

## Changes

### `src/lib/engine.ts`

1. **Add types and helpers** near the existing `Row` / `Source` block:

    ```ts
    export type BindingContext = {
        root:    Wrapper;
        current: Row | null;
        parent:  BindingContext | null;
    };

    export const rootContext  = (root: Wrapper): BindingContext =>
        ({ root, current: null, parent: null });

    export const childContext = (parent: BindingContext, row: Row): BindingContext =>
        ({ root: parent.root, current: row, parent });

    export const nearestRow = (ctx: BindingContext): Row | null => {
        for (let c: BindingContext | null = ctx; c; c = c.parent)
            if (c.current) return c.current;
        return null;
    };

    export const ownerUnsubs = (ctx: BindingContext): Off[] =>
        ctx.current ? ctx.current.unsubs : ctx.root._unsubs;

    export const own = (ctx: BindingContext, off: Off) =>
        ownerUnsubs(ctx).push(off);
    ```

2. **`DirectiveContext`** (line 38) — drop derived fields, add `ctx`:

    ```ts
    export interface DirectiveContext extends pURL {
        ctx:  BindingContext;
        el:   Element;
        wake: (node: Element, ctx: BindingContext) => void;
    }
    ```

3. **`wire()`** (line 129) — signature becomes `wire(el, attr, ctx)`. Replace:
   - `row` derivations → `nearestRow(ctx)`
   - `wrapper` derivations → `ctx.root`
   - `unsubs` lookups → `ownerUnsubs(ctx)`
   - `@event` detail: `item: nearestRow(ctx)?.item`
   - Directive call site: pass `{ ...dwrl, ctx, el, wake }` instead of
     `{ ...dwrl, wrapper, el, row, wake }`

4. **`wake()`** (line 188) — signature becomes `wake(root, ctx)`. Drop the
   `row?, wrapper?` defaults; trust the caller. Pass `ctx` through to `wire`.

5. **`reconcile()`** (line 217) — signature gains `ctx: BindingContext` (the
   *parent* context). Line 254 changes to:

    ```ts
    for (const row of fresh) wake(row.node, childContext(ctx, row));
    ```

6. **`listDirective`** (line 259):
   - Destructure `{ ctx, el, params }` (no more `wrapper`).
   - Use `ctx.root._listCache` for the cache map.
   - Pass `ctx` into `reconcile(...)`.
   - **Register cache cleanup** via `own(ctx, () => { ... })` once per
     directive activation. The cleanup unwires every row, removes every row
     node, clears the cache, and `delete`s the cache from `ctx.root._listCache`.

7. **`ifDirective`** (line 282):
   - Destructure `{ ctx, el }`.
   - Replace `wake(live, row ?? null, wrapper)` with `wake(live, ctx)`.
   - Delete the `unwireSubtreeIfRow` no-op stub (line 306) and its `_row` arg.
     The RFC's non-goal #9 makes this a documented limitation, not a bug.

### `src/lib/element.ts`

- **`connectedCallback`** (line 118): `wake(this)` → `wake(this, rootContext(this))`.
- **`load()`** (line 178): `wake(wrapper)` → `wake(wrapper, rootContext(wrapper))`.

### `src/lib/index.ts`

No change needed — `engine.ts` re-export already covers the new exports.

## Acceptance

1. `bun typecheck` clean.
2. `bun run build` clean.
3. Existing views (`views/nav.html`, `views/showcase/todos.v3.html`,
   `views/showcase/counter.v2.html`, `views/showcase/theme.html`,
   `views/showcase/theme-import.html`) render and behave identically.
4. The RFC's nested-orders example renders correctly when added as a smoke
   view. Place at `views/showcase/orders.html`:

    ```html
    <script type="module" data-component data-module="@view/orders">
        export let orders = [
            { id: 1, customer: 'Ada', lines: [
                { id: 'a', sku: 'PEN', qty: 2 },
                { id: 'b', sku: 'INK', qty: 1 },
            ]},
            { id: 2, customer: 'Grace', lines: [
                { id: 'c', sku: 'TAPE', qty: 4 },
            ]},
        ];
    </script>
    <section>
        <template *list="orders">
            <article>
                <h3 $text="./customer"></h3>
                <ul>
                    <template *list="./lines">
                        <li>
                            <span $text="./sku"></span> ×
                            <span $text="./qty"></span>
                        </li>
                    </template>
                </ul>
            </article>
        </template>
    </section>
    ```

    Mount with `<data-wrapper src="/views/showcase/orders.html"></data-wrapper>`.
    Each line item should display the correct `sku`/`qty` from its own row,
    not from the outer order row.

5. Removing an outer order from `orders` (via DevTools mutation or a test
   action) leaves no nested row caches behind in `wrapper._listCache`.

## Out of scope

- `../parent` syntax
- Renaming `Row`
- Block-local `*if` cleanup (acknowledged limitation per RFC non-goal #9)
- Anything else not in RFC §"Resolved Decisions"

Roughly 30–50 lines net in `engine.ts`, 2 lines in `element.ts`.
