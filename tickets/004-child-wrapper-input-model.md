# Ticket 004: Child Wrapper Input Model

## Goal

Define the official parent-to-child input channel for nested `<data-wrapper>`
composition.

Child inputs are declared on the child host's `src` query string. Each query
entry is resolved at the mount point and handed to the child's **default
factory** via `context`; the factory chooses what to expose as instance
bindings. Inputs are not auto-injected into the binding namespace.

```html
<data-wrapper src="/views/card.html?customer&status=orderStatus"></data-wrapper>
```

means:

```txt
child input `customer` resolves from parent scope name `customer`
child input `status` resolves from parent scope name `orderStatus`
```

If the right-hand side does not resolve in scope, it becomes a static literal
source. This keeps URL query params useful for literal component configuration:

```html
<data-wrapper src="/views/counter.html?start=5"></data-wrapper>
```

## Rationale

Module imports solve shared singleton state. Binding contexts solve lexical row
state. Child wrappers need an explicit per-instance input channel without
reopening implicit parent lookup inside child contents.

The model should preserve the component boundary:

```txt
module top level = singleton/shared exports
default factory = per-wrapper instance bindings (and the sole input sink)
src query inputs = per-wrapper data handed to the factory
```

The wrapper element is the DOM mount and teardown shell. It is not the source of
truth for lookup. Lookup should resolve through `BindingContext` scopes into
`Source` objects.

## Source-Scope Refactor

Before implementing props, update the binding model around scopes:

```ts
type BindingContext = {
  wrapper: Wrapper;
  scope: SourceScope | null;
  parent: BindingContext | null;
  unsubs: Off[];
};

type SourceScope = {
  source(path: string): Source | null;
};
```

Rows and component runtimes become `SourceScope`s. The wrapper can remain in
context for DOM ownership, load, and teardown, but resolution walks scopes
rather than asking the wrapper as the primary lookup object.

Inputs are **not** part of the binding lookup at all (see Input Semantics): they
are handed to the factory, not resolved as bindings. So the scope chain stays
`rows → runtime`, and the runtime resolves `instance → module` — no input tier.

Bare-name lookup climbs the context chain:

```txt
current row scope -> parent row scopes -> component/root scope
```

`./key` remains the explicit current/local row form (no climb). `/key` (the
component/root-scope escape hatch) is deferred to Phase 4. `../` and `//host`
remain out of scope for this ticket.

Because rows become scopes, "row" stops being a special `BindingContext` field.
Anything that read the nearest row directly must now derive it from the context
chain — in particular, `@event` `detail.item` should come from the nearest row
scope via the `BindingContext`, not a captured row handle. The row scope must
still expose its item and identity, because `*list` reconcile keys on identity
and publishes to the row's subscriptions.

## Input Semantics

Each `src` query entry is an assignment:

```txt
?name          -> input name `name`, expression `name`
?name=value    -> input name `name`, expression `value`
```

Expression resolution:

1. Try to resolve the expression through the current parent `BindingContext`.
2. If it resolves, use that `Source`.
3. If it does not resolve, create a static literal source from the expression.

Root wrappers use the same assignment rule. With no parent scope available,
query values become static literal sources.

The resolved inputs are delivered **only** to the default factory, as a `props`
object whose entries are stable references. There is no auto-binding — a template
can bind an input only if the factory returns it:

```js
export default ({ props }) => {
    const { url, customer, start } = props;
    return { customer, start };
};
```

Rules:

```txt
bare value prop = static value
function prop = stable function reference; callers may invoke it for current value
props.url = full `src` string
```

`url` is reserved on `props`; a query entry named `url` does not override
`props.url`.

If a factory needs raw query access, it can parse `props.url` with the existing
pURL helper:

```js
const { params } = p(props.url);
```

## Binding Behavior

A template binds an input only after the factory has returned it as an instance
binding — there is no separate input layer:

```html
<!-- /views/card.html -->
<script type="module" data-component data-module="@view/card">
    export default ({ props }) => props;   // expose all inputs, or pick selectively
</script>
<h3 $text="customer/firstName"></h3>
<p $text="status"></p>
```

Binding precedence is unchanged: `factory return (instance) > module exports`.

Token behavior stays simple:

```txt
$ and * bindings read/call functions to produce render values
@ bindings invoke functions on the event
```

The framework does not need a separate function-vs-value enforcement layer for
this ticket. Developers are responsible for binding the right kind of value to
the right token.

Implementation detail: preserve the difference between a stable reference and a
render read. A function source is a stable reference, but `$` and `*` effects
call it to produce the rendered value and should still update when that return
value changes during the normal flush cascade. `@` should use the function
reference itself and invoke it only when the event fires.

### Resolution miss

A bare or `./` lookup that resolves nowhere up the chain falls back to a static
literal source (the name itself). For dynamic bindings (`$`, `*`) this also emits
a `console.warn` — those tokens expect a dynamic source, so a static fallback is
almost always a typo, but it is not fatal and must not abort sibling bindings.
Input assignment uses the same literal fallback with no warning (literal config
like `?start=5` is intentional). Reserved forms (`../`, `//host`) stay an inert
no-op, distinct from a miss.

## Loading And Context Capture

`wake()` should own discovery of child wrapper hosts because it has the lexical
`BindingContext` at the mount point.

When `wake()` reaches a child `<data-wrapper src="...">` host:

1. wire any bindings on the child host under the current context
2. claim the child host with the current context
3. start loading the child with that context
4. prune traversal before entering the child contents

Do not store the parent context on the child element. Pass the context into the
load/claim operation directly.

`connectedCallback()` should not directly load nested wrappers as roots before
their parent wake can claim them. Loading must remain idempotent; the existing
`_loadedSrc` marker is acceptable for this ticket.

Directive-created DOM must be woken through the injected `DirectiveContext.wake`
closure so `*list` rows and `*if` bodies preserve the loader-aware binding
context for nested child wrappers.

Do not add `_parentContext`, `_loadingSrc`, service-locator loader registration,
or a separate lifecycle module for this ticket.

## Phased Plan (review checkpoints)

Delivered in small, independently reviewable steps. Stop at each checkpoint for a
code review before starting the next.

### Phase 1 — Source/Scope refactor (foundation)

Introduce `SourceScope`, give `BindingContext` a scope chain, and convert rows
and the component runtime into scopes. Replace `nearestRow + wrapper._component`
with recursive scope resolution; bare names now climb to the root. Move `@event`
`detail.item` derivation onto the `BindingContext`. No props yet.

**Checkpoint:** every existing showcase and contract test still behaves; bare
names climb; resolution no longer routes through the wrapper as the lookup
object.

### Phase 2 — Resolution miss policy

A bare/`./` miss yields a static literal source; `$`/`*` bindings also
`console.warn`. Reserved `../`/`//host` stay no-op.

**Checkpoint:** a typo'd `$text` warns and renders the literal name without
aborting sibling bindings; resolved bindings are unaffected.

### Phase 3 — Child inputs & props

Interpret `src` query entries as input assignments (resolve in the parent context
at the mount point, else static literal). Build the `props` object
(value-or-function, plus `props.url`) and deliver it to the factory via
`context` — no binding-lookup change, no input tier. `wake()` claims a child host
with the current context and passes that context into load; no `_parentContext`.
Keep `_loadedSrc`; add no new wrapper-private load state unless a real race
remains.

**Checkpoint:** the Acceptance list below.

### Phase 4 — `/key` escape hatch

Add `/key` for explicit component/root-scope addressing; confirm `./key` stays
explicit-local.

**Checkpoint:** `/key` resolves only at the root/component scope, bypassing row
scopes.

Unrelated `*list` reconciliation fixes stay out of all four phases.

## Non-Goals

- No implicit parent-scope lookup inside child contents.
- No provide/inject.
- No cross-wrapper global registry.
- No `<data-component>` alias.
- No strict typo detection or spellchecking yet.
- No `../` or `//host` addressing.
- No automatic whole-row-as-props behavior.
- No auto-overlay of inputs into the binding namespace; inputs reach templates
  only via the factory return.
- No input tier in resolution; the runtime resolves `instance > module` only.
- No dataset-based state model.

## Acceptance

- A parent can pass per-row data to a child wrapper intentionally.
- Child inputs declared in `src` query params are delivered to the factory.
- `src="/child.html?customer&status=orderStatus"` resolves against the parent
  scope at the child mount point.
- Unresolved input expressions become static literal sources.
- Child factories receive resolved inputs as `context.props`, including stable
  `props.url`.
- Inputs reach templates only through the factory return; nothing is
  auto-injected into the binding namespace.
- Binding precedence is unchanged: factory return shadows module exports.
- Bare lookup climbs row scopes to the root/component scope.
- Nested child wrappers do not self-load before parent `wake()` claims them.
- Existing literal config via URL query params remains possible.
