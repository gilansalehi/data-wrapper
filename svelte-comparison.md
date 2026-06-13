# Svelte and Data-Wrapper: Component Pivot

## Purpose

This document records the current direction for Data-Wrapper and appends the
first implementation ticket for that direction.

Data-Wrapper began as a DOM-native reactive wrapper whose authoring model
leaned heavily on `data-*` state and pURLs. That work produced useful runtime
primitives, but it also pushed pURLs into jobs better handled by JavaScript.

The strongest feature to emerge is `load()`: a `<data-wrapper src="...">` can
fetch an HTML file, install its markup, preserve host state, wire token
attributes, and run component-local setup code. That makes a loaded HTML file
the natural component boundary.

The pivot is:

> Data-Wrapper is a JS-lite component framework delivered by one script tag.
> Loaded HTML components are the preferred authoring model. JavaScript modules
> provide local component values and behavior. pURLs remain the addressing
> language for wrapper state, row state, cross-wrapper state, protocols, and
> event options.

This is not an attempt to reproduce Svelte. It borrows Svelte's component
anatomy and colocation while retaining a browser-native, compiler-free runtime.

---

# Part I: Comparison and Direction

## Current Framework Reality

The current library already provides more of a component runtime than the old
"inert HTML view" description suggests.

### What `load()` already does

For an HTML `src`, the current loader:

1. Fetches and parses the HTML into a fragment.
2. Extracts owned `<script type="dw/controller">` blocks.
3. Tears down escaping subscriptions from the previous view.
4. Replaces the wrapper's light-DOM contents.
5. Preserves the wrapper element and its `data-*` state.
6. Resets wrapper subscriptions and list caches.
7. Wakes the inserted DOM and compiles token attributes.
8. Runs extracted controllers.
9. Emits `dw/loaded` and `dw/ready`.

Ordinary `<style>` elements in the loaded HTML are already inserted and work as
regular light-DOM CSS. Ordinary scripts remain inert unless the legacy
`?run-scripts` option is used.

The current loader also supports `.js` and `.mjs` sources by importing them and
calling their default export with the wrapper.

### What the reactive engine already does

The engine has a useful source abstraction:

```ts
type Source = {
    read:      ()           => unknown;
    write:     (v: unknown) => void;
    subscribe: (cb: Sub)    => Off;
    escapes:                   boolean;
};
```

`$` property bindings and `*` directives both consume this interface. Existing
wrapper state, row-relative state, cross-wrapper state, and registered
protocols differ at resolution time, but `wire()` sees the same `Source`
shape.

This is the key implementation advantage for the pivot: component-module
values can become one more Source implementation. They do not require a second
render engine.

### Existing token semantics

The current tokens mean:

| Token | Current responsibility |
|---|---|
| `$` | Subscribe to a source and write its value to a DOM property/attribute |
| `*` | Subscribe to a source and pass its value to a structural directive |
| `@` | Convert a native DOM event into an action topic or write protocol event |

Important current behavior:

- Bare values are already valid pURLs. `$text="title"` currently reads the
  wrapper-state channel `title`, just like `$text="/title"`.
- `@click="inc"` already dispatches the action topic `inc`.
- `*list` is already the canonical list directive. There is no implemented
  `$list` compatibility path to remove.

The component pivot must account for those facts instead of treating bare
values as previously invalid.

## The New Preferred Component Shape

A page loads the framework once:

```html
<script src="/dist/data-wrapper.min.js"></script>
```

It instantiates components with ordinary HTML:

```html
<data-wrapper
    src="/components/counter.html"
    data-step="1">
</data-wrapper>
```

The loaded file colocates its JavaScript module, markup, templates, and styles:

```html
<script type="module" data-dw>
    export const title = 'Counter';
    export const count = 0;

    export const actions = {
        increment: ({ component }) => {
            component.set('count', count => Number(count) + 1);
        },
    };
</script>

<section>
    <h2 $text="title"></h2>
    <button @click="increment">Increment</button>
    <output $text="count"></output>
</section>

<style>
    @scope {
        output { font-variant-numeric: tabular-nums; }
    }
</style>
```

The `<section>` is optional. The `<data-wrapper>` is already the component host,
so the component file should use whatever top-level semantic markup it needs.

## Division of Responsibility

The pivot works when module scope and pURL state have distinct, useful jobs.

### Component-module values

Use bare names for values owned by the loaded component:

```html
<h2 $text="title"></h2>
<button $disabled="isSaving"></button>
<ul *list="visibleTodos"></ul>
```

These values:

- originate from module exports,
- live in a mutable component scope after import,
- update through `component.set()`,
- are not automatically reflected into `data-*`,
- are recreated when a new component view is loaded.

### Wrapper and row state

Use explicit pURL-shaped values for durable or externally visible state:

```html
<span $text="/user/name"></span>
<span $text="./task"></span>
<span $text="//settings/theme"></span>
```

These retain the existing behavior:

- `/path` addresses the local wrapper's `data-*` state,
- `./path` addresses the current list row,
- `//host/path` addresses another wrapper,
- protocol pURLs address registered external sources,
- query parameters provide existing formatter and event-option behavior.

Recommended guidance:

- Use component values for local implementation details and local derived view
  data.
- Use `data-*` plus explicit pURLs for host inputs, public state, CSS-observable
  state, cross-wrapper state, persistence bindings, and state that should
  survive component-scope replacement.

### Actions

`@` keeps its existing event-topic behavior:

```html
<button @click="increment">Increment</button>
<form @submit="todo/add?prevent"></form>
<input @change="put:/filter" name="filter">
```

Exported actions register handlers for those existing topics. The framework
does not reinterpret `@click="increment"` as a component-value binding.

This preserves the current path/options/payload event model and avoids adding a
second event system.

## Svelte Comparison

### What Data-Wrapper borrows

| Svelte strength | Data-Wrapper direction |
|---|---|
| One component file colocates script, markup, and style | Loaded `.html` component with one opted-in inline module |
| Component-local values are easy to bind | Named module exports initialize a mutable component scope |
| Component behavior lives beside its markup | Exported `actions`, setup, mount, and destroy hooks |
| Component instances own lifecycle and cleanup | A per-load ComponentScope owns subscriptions, action listeners, and cleanups |
| Parent markup instantiates a component succinctly | `<data-wrapper src="/components/example.html">` |

### What Data-Wrapper deliberately does differently

| Svelte | Data-Wrapper |
|---|---|
| Compiler transforms component syntax | Loader imports a real browser module and `wake()` compiles token attributes |
| JavaScript expressions can appear in markup | Attributes contain bare component names or pURLs, not expressions |
| Local variables are compiler-reactive | Component values update explicitly through `component.set()` |
| Scoped styles are compiler-rewritten | Styles remain native light-DOM CSS; authors may use browser `@scope` |
| Component events use Svelte conventions | Actions remain native events plus existing Data-Wrapper topics and payloads |
| Component props are compiler-defined | Host `data-*` remains the available input mechanism until a props API is earned |

### What remains valuable from v0.1

The pivot does not discard the existing engine. It changes which features sit
at the center of authoring.

Keep:

- compiled-at-wake subscriptions,
- the Source interface,
- direct DOM sinks with no virtual DOM,
- wrapper `data-*` state and path-aware APIs,
- row-relative list bindings and keyed reconciliation,
- native bubbling action events and form-style payloads,
- pURL protocols, cross-wrapper paths, and event options,
- light-DOM inspectability,
- extension registries where they continue to solve real problems.

Reframe:

- pURLs are no longer expected to express all local component computation.
- `$data-*` computed declarations are an available legacy/low-level mechanism,
  not the preferred answer for complex local derived values.
- `dw/controller`, `onload`, standalone JS `src`, and `?run-scripts` remain
  compatibility surfaces while component modules are proven.

## Design Boundaries for the First MVP

The first implementation should prove the component-module source model before
expanding it.

### Include

- Loader-controlled HTML components only.
- Exactly one owned `<script type="module" data-dw>` per loaded component.
- Named exports copied into a mutable component scope.
- Optional exported `state`, `actions`, `default`, `mount`, and `destroy`.
- Bare-name `$` and `*` bindings backed by the component Source.
- Existing `@` routing with exported action handlers.
- `component.get()`, `component.set()`, `component.register()`, and cleanup.
- Existing styles inserted unchanged.
- Existing pURL behavior for explicit pURL-shaped values.

### Defer

- Relative imports from the inline module.
- Rewriting imports or resources.
- A props API beyond existing host state.
- Derived/effect APIs.
- Nested bare-name paths.
- Formatters on bare component bindings.
- Special style extraction, scoping, or deduplication.
- Inline modules in parser-created, non-loaded wrappers.
- Multiple component modules.
- Live synchronization with ES module export bindings.
- `src` attribute observation and automatic reload.
- Load-race cancellation and component caching.
- Removal of legacy controller and script paths.

These are legitimate future questions, but the MVP should generate evidence
before answering them.

## North Star

Data-Wrapper should make a personal site feel like a directory of native HTML
components:

```txt
components/
  nav.html
  counter.html
  todos.html
  contact-form.html
```

Each component is instantiated with one element. The framework arrives through
one script tag. JavaScript remains real JavaScript. HTML remains the template.
pURLs remain a compact language for explicit state addressing where they are
useful.

---

# Part II: Ticket - Component Scope and Inline Module Export Bindings

## Summary

Refactor the HTML branch of `DataWrapper.load()` so a loaded HTML view may
contain one opted-in inline component module:

```html
<script type="module" data-dw>
    export const title = 'Counter';
    export const count = 0;

    export const actions = {
        increment: ({ component }) => {
            component.set('count', count => Number(count) + 1);
        },
    };
</script>

<h2 $text="title"></h2>
<button @click="increment">Increment</button>
<output $text="count"></output>
```

The loader extracts and dynamically imports the module. Its named value exports
initialize a mutable per-load ComponentScope. Bare-name `$` and `*` bindings
read from that scope. Existing explicit pURL bindings and all existing `@`
event behavior remain intact.

This ticket establishes the smallest useful component lifecycle and binding
source. It does not add derived values, props, relative imports, expression
syntax, or special style processing.

## Motivation

The current loader already makes loaded HTML a useful composition unit, but its
preferred JavaScript path is still based on legacy assumptions:

- `<script type="dw/controller">` is evaluated with `new Function()`.
- Ordinary scripts require the `?run-scripts` escape hatch.
- `onload=""` and standalone JS `src` split component behavior away from its
  loaded HTML.
- pURLs and `data-*` state carry local concerns that ordinary JavaScript can
  express more clearly.

An opted-in inline module gives the loader a real module namespace with no
compiler and no expression parser. Exported values become the component's local
binding surface, while existing wrapper state and pURLs continue serving their
current explicit state-addressing roles.

## Current-Code Constraints

The implementation must fit these existing contracts:

1. `wire()` currently parses every token value as a pURL before resolving it.
2. Bare pURL values currently address wrapper state.
3. `$` and `*` already consume the common `Source` interface.
4. `@` already dispatches action topics and protocol events and must not gain a
   competing component-binding mode.
5. `wake()` skips nested `<data-wrapper>` elements and `<template>` contents.
6. `unwake()` currently tears down tracked escaping subscriptions, but
   `wrapper.register()` does not return or record listener cleanup.
7. Existing loaded styles work through normal fragment insertion.
8. Existing `dw/controller`, `?run-scripts`, `onload`, and JS-module `src`
   behavior must continue working during the MVP.

## Terminology

Use these names consistently:

- **Component module**: the owned `<script type="module" data-dw>` extracted
  from a loaded HTML component.
- **ComponentScope**: the internal per-load runtime object holding mutable
  component values, its Station, actions, and cleanups.
- **Component binding**: a bare-name `$` or `*` binding resolved against the
  active ComponentScope.
- **Wrapper state binding**: an explicit pURL-shaped binding resolved through
  the existing pURL and Source pipeline.

Expose the active scope publicly as:

```js
wrapper.component
```

Use `ComponentScope` as the internal type/class name. "Lifecycle manager" is
too broad for the MVP object.

## Authoring Contract

### Component file

```html
<script type="module" data-dw>
    export const title = 'Counter';
    export const count = 0;

    export const actions = {
        increment: ({ component }) => {
            component.set('count', count => Number(count) + 1);
        },
    };

    export default function setup(component) {
        // Optional setup after DOM insertion and before wake.
        // May return a cleanup function.
    }

    export function mount(component) {
        // Optional setup after wake.
        // May return a cleanup function.
    }

    export function destroy(component) {
        // Optional final lifecycle callback during component destruction.
    }
</script>

<h2 $text="title"></h2>
<button @click="increment">Increment</button>
<output $text="count"></output>

<style>
    @scope {
        output { font-variant-numeric: tabular-nums; }
    }
</style>
```

### Instantiation

```html
<data-wrapper src="/components/counter.html"></data-wrapper>
```

Only loader-controlled HTML receives component-module processing in this
ticket. An equivalent module written directly inside an inline wrapper in the
original page is out of scope. Do not use the component-module syntax there:
the browser will execute a parser-created `<script type="module">` normally,
but Data-Wrapper will not capture its exports.

## Binding Resolution Rules

### Bare-name grammar

The MVP component-binding grammar is:

```txt
[a-zA-Z_$][a-zA-Z0-9_$]*
```

No dot paths, slashes, protocols, queries, or hashes are included.

### `$` and `*`

When an active ComponentScope exists:

```txt
bare identifier → component Source
anything else   → existing pURL resolution
```

Examples:

```html
<h2 $text="title"></h2>           <!-- component value -->
<ul *list="visibleTodos"></ul>    <!-- component value -->

<h2 $text="/title"></h2>          <!-- wrapper data-* state -->
<span $text="./task"></span>      <!-- list-row state -->
<span $text="//other/title"></span>
<span $text="/price?currency"></span>
```

When no active ComponentScope exists, all values retain current pURL behavior.
This preserves legacy loaded views and inline wrappers.

The component-source branch must occur before calling `p(value)`. Do not change
the pURL parser to understand component names.

### `@`

`@` always retains its current event behavior:

```html
<button @click="increment">Increment</button>
<form @submit="todo/add?prevent"></form>
<input @change="put:/filter" name="filter">
```

Exported `actions` register handlers for the emitted topics. They do not become
an alternate `@` source type.

### Bare binding formatters

Bare component bindings with query parameters are not supported in the MVP:

```html
<!-- Not a component binding in the MVP -->
<output $text="count?currency"></output>
```

Because it is not a bare identifier, it follows existing pURL resolution.
Authors should export another component value until component-source
transformations are designed from real use.

## ComponentScope Contract

Minimum conceptual shape:

```ts
class ComponentScope {
    wrapper:  DataWrapper;
    root:     DataWrapper;
    src:      string;
    module:   ComponentModule;
    values:   Record<string, unknown>;
    subs:     Station;
    cleanups: Off[];

    get(name: string): unknown;
    set(name: string, valueOrUpdater: unknown | ((prev: unknown) => unknown)): void;
    register(actions: Record<string, ComponentAction>): Off;
    source(name: string, escapes?: boolean): Source;
    destroy(): Promise<void>;
}
```

The exact internal representation may use a `Map` or plain object. The public
behavior matters:

- `get(name)` reads a component value.
- `set(name, valueOrUpdater)` updates the mutable component value.
- `set()` skips publication when `prev === next`.
- `set()` publishes the updated value to the component Station channel.
- `register(actions)` registers action-topic listeners and returns one
  idempotent batch cleanup.
- `source(name, escapes)` returns a Source backed by `get`, `set`, and the
  component Station.
- `destroy()` runs registered cleanups and the exported destroy hook exactly
  once.

`root` is the wrapper. Do not retain the parsed `DocumentFragment` as the root;
it becomes empty after insertion.

## Export Normalization

### Reserved exports

The MVP recognizes:

```txt
state
actions
mount
destroy
default
```

Every other named export initializes a bindable component value.

### Value normalization

```js
export const state = {
    title: 'Fallback title',
    count: 0,
};

export const title = 'Counter';
```

Produces initial mutable component values equivalent to:

```js
{
    title: 'Counter',
    count: 0,
}
```

Rules:

1. Copy enumerable keys from a valid exported `state` object.
2. Copy all non-reserved named exports over those keys.
3. Named exports win over `state`.
4. Do not mutate the imported module namespace.
5. Do not attempt to observe later assignments to live ES module exports.
6. Updates after initialization go through `component.set()`.

### Shape validation

- `state`, when present, must be a non-null, non-array object.
- `actions`, when present, must be a non-null, non-array object whose values
  are functions.
- `default`, `mount`, and `destroy`, when present, must be functions.
- Invalid reserved exports fail component setup with a clear error.

## Exported Actions

Example:

```js
export const actions = {
    increment: ({ component }) => {
        component.set('count', count => Number(count) + 1);
    },

    'todo/add': ({ component, event, payload }) => {
        const task = String(payload.task ?? '').trim();
        if (!task) return;
        // Array helpers are deferred; use set() in the MVP.
        component.set('todos', todos => [
            ...(Array.isArray(todos) ? todos : []),
            { id: crypto.randomUUID(), task, done: false },
        ]);
        event.target.reset?.();
    },
};
```

Each action receives:

```ts
{
    component:     ComponentScope;
    wrapper:       DataWrapper;
    event:         CustomEvent;
    originalEvent: Event | undefined;
    payload:       Record<string, unknown>;
}
```

This is a convenience wrapper around the existing emitted action event. The
underlying event type, target, currentTarget, detail, payload harvesting, and
event options remain unchanged.

Component action registration must be lifecycle-owned. Reloading or destroying
the component must remove its registered listeners.

To support this cleanly, change the existing wrapper API:

```ts
wrapper.register(actions): Off
```

Existing callers may ignore the returned cleanup, preserving compatibility.
The ComponentScope records the returned batch cleanup.

## Component Source

Component values should enter the existing `$` and `*` pipeline through a
Source:

```ts
{
    read:      ()   => component.get(name),
    write:     value => component.set(name, value),
    subscribe: cb   => subscribe(component.subs, name, cb, component.get(name)),
    escapes,
}
```

This gives component bindings the same initial-fire and publish behavior as
existing sources.

For a binding in the component's wrapper-level DOM, `escapes` is `false`.
Destroying the whole ComponentScope can discard its Station as one unit, so
those subscriptions do not need individual cleanup tracking.

For a bare component binding inside a `*list` row, `escapes` is `true`: the
subscription lives on the component Station but the consuming DOM node lives
only as long as the row. Its `Off` must be recorded in `row.unsubs`, matching
the existing teardown rule for an absolute `/path` binding inside a row.

List-row behavior remains unchanged:

- `*list="todos"` subscribes the list directive to a component array.
- Bindings inside its template continue using `./task`, `./done`, and other
  existing row-relative pURLs.

## Module Discovery and Ownership

The loader processes exactly one owned module:

```css
script[type="module"][data-dw]
```

Ownership follows the current controller rule:

- A module at the loaded fragment's top ownership level belongs to the loading
  wrapper.
- A module nested inside a descendant `<data-wrapper>` does not belong to the
  outer loader and must not be imported by it.

Rules:

- Zero owned modules: load as a legacy HTML view with no ComponentScope.
- One owned module: extract, remove, and import it.
- More than one owned module: throw a clear setup error.
- An owned component module plus an owned `dw/controller` in the same loaded
  view: throw a clear conflict error for the MVP.
- Nested modules remain untouched and inert in the MVP. A nested component
  should use its own `src` so its own loader controls its module.
- Nested-wrapper-owned `dw/controller` blocks retain their current behavior.

## Module Import

For the MVP:

1. Read the extracted module's text content.
2. Create a JavaScript Blob.
3. Create an object URL.
4. Dynamically import the object URL.
5. Revoke the object URL in `finally`.

The component module is trusted app-authored code.

Known and accepted MVP limitations:

- Relative imports inside the inline module are unsupported.
- `import.meta.url` is the generated Blob URL.
- Do not rewrite imports.
- Do not parse exports manually; use the imported module namespace.

These limitations must be documented but do not need framework work yet.

## Security and Platform Constraints

Component modules are executable, trusted application code.

- Only load component HTML from trusted sources.
- The explicit `data-dw` marker is required before the loader executes an
  inline module.
- Ordinary scripts remain inert unless an existing legacy path explicitly runs
  them.
- Blob-backed module import may require a Content Security Policy that permits
  `blob:` module scripts. CSP-specific alternatives are deferred until they
  become a real deployment constraint.

## Styles

No special style behavior is added in this ticket.

- Existing `<style>` elements remain in the loaded fragment and are inserted
  normally.
- `<style data-dw>` may be used as an authoring convention, but `data-dw` has no
  loader semantics for styles in the MVP.
- Authors may use native `@scope` where appropriate.
- Shadow DOM, generated scoping selectors, style deduplication, and external
  style resolution are deferred.

## Loader and Lifecycle Flow

Recommended HTML load flow:

```txt
1. Resolve src URL.
2. Fetch HTML.
3. Parse HTML into a template fragment.
4. Discover owned component module and legacy controllers.
5. Reject conflicting or multiple owned component modules.
6. Extract and import the component module, if present.
7. Validate its reserved exports.
8. Keep the existing rendered component alive until fetch/import/validation succeeds.
9. Destroy the previous ComponentScope, if any.
10. Unwake the previous rendered subtree.
11. Replace the wrapper's contents with the new fragment.
12. Reset wrapper subscriptions, unsubs, list cache, and _live marker as today.
13. Create and assign the new ComponentScope, if a module exists.
14. Normalize module values and register exported actions.
15. Run default setup(component); record a returned cleanup.
16. Wake the inserted DOM.
17. Run mount(component); record a returned cleanup.
18. Run legacy controller flow only for a legacy view without a component module.
19. Emit dw/loaded.
20. Emit dw/ready.
```

Why setup runs before wake:

- Initial component values and action registration exist before bindings
  initial-fire.
- Setup can prepare component values without causing a visibly empty first
  render.
- The DOM has already been inserted, so setup may query `component.root` when
  necessary.

Why mount runs after wake:

- Token bindings are live.
- Imperative behavior can interact with fully wired DOM.

Default setup and mount may return an `Off`, a promise of an `Off`, or nothing.
The loader awaits each hook and records any returned cleanup before continuing.
The exported destroy hook may also be async and is awaited during destruction.

### Destruction

Destroy the active ComponentScope:

- before replacing it with another successfully prepared component,
- when the wrapper disconnects.

Destruction order:

```txt
1. Run registered cleanup functions once.
2. Run exported destroy(component) once.
3. Clear the component Station and values.
4. Remove wrapper.component reference.
```

If exact cleanup-vs-destroy ordering proves awkward during implementation, it
may be adjusted in a focused review. The important MVP contract is deterministic
and once-only teardown.

## Error Handling

All load/setup failures emit `dw/error` and reject `load()`.

Use phase information:

```ts
{
    src: string;
    phase:
        | 'fetch'
        | 'parse'
        | 'import'
        | 'exports'
        | 'setup'
        | 'mount'
        | 'destroy';
    error: unknown;
}
```

Required errors:

- Multiple owned component modules.
- Mixed owned component module and owned `dw/controller`.
- Invalid reserved export shape.
- Module import failure.
- Setup, mount, or destroy failure.

Missing bare component binding behavior:

- Warn once per ComponentScope and missing name.
- Subscribe and initial-fire with `undefined` so a later
  `component.set(name, value)` can activate the binding.
- Avoid one warning per list row or DOM node.

Example warning:

```txt
[data-wrapper] Missing component binding "isSaving" in /components/form.html
```

## Compatibility

The MVP intentionally preserves:

- Explicit `/path`, `./path`, and `//host/path` pURL bindings.
- Existing pURL formatters and protocols.
- Existing `@` topics, write protocols, event options, and payloads.
- Existing `*list` and row-relative binding behavior.
- Existing HTML views with no component module.
- Existing `dw/controller` views.
- Existing `?run-scripts` behavior.
- Existing `onload` behavior.
- Existing `.js` and `.mjs` `src` behavior.
- Existing direct `wrapper.register()` callers.

Intentional new behavior:

- In a loaded view with an active component module, a bare identifier on `$` or
  `*` resolves to component scope instead of the wrapper-state pURL channel.
- Authors can always select wrapper state explicitly with `/name`.

This is a scoped breaking change in component-module views, not a global pURL
grammar change.

## Non-Goals

This ticket does not introduce:

- a compiler,
- a virtual DOM,
- arbitrary JavaScript expressions in attributes,
- automatic tracking of module variables,
- dot-path component bindings,
- component-binding query parameters or formatters,
- derived values or effects,
- component array helper methods,
- a new props API,
- relative import support,
- import rewriting,
- special style processing,
- multiple component modules,
- inline-page component module processing,
- source caching,
- load cancellation or race handling,
- automatic reload when `src` changes,
- removal of any legacy authoring path.

## Testing Plan

### ComponentScope unit tests

- Normalizes named exports into mutable values.
- Merges exported `state`, with named exports winning.
- Rejects invalid reserved export shapes.
- `get()` reads a value.
- `set()` accepts a value and updater function.
- `set()` publishes only when identity changes.
- `source()` initial-fires and publishes updates.
- `source(name, true)` marks a component subscription as escaping.
- `register()` action cleanup is recorded.
- `destroy()` runs cleanups and the destroy hook once.

### Binding resolution unit tests

- In a component-module view, `$text="count"` reads component scope.
- In a component-module view, `*list="items"` reads component scope.
- `$text="/count"` continues reading wrapper state.
- `$text="./task"` continues reading row state.
- `@click="inc"` continues dispatching the `inc` action topic.
- Without a ComponentScope, `$text="count"` retains legacy wrapper-state
  behavior.
- Missing component names warn once and become live after `component.set()`.
- Non-bare values continue through pURL resolution.
- A bare component binding inside a list row is tracked in `row.unsubs` and is
  detached when the row is evicted.

### Loader unit tests

- Loads a legacy HTML view with no component module.
- Extracts and removes one owned component module.
- Ignores a nested-wrapper-owned component module.
- Rejects multiple owned component modules.
- Rejects a mixed owned module and owned `dw/controller`.
- Imports the Blob module namespace.
- Revokes the object URL after success and failure.
- Keeps the existing rendered component intact when fetch/import/export
  validation fails.
- Assigns `wrapper.component` before setup and wake.
- Emits phased `dw/error` detail.

### Actions and lifecycle tests

- Exported action fires from an existing `@click` topic.
- Action receives component, wrapper, event, originalEvent, and payload.
- Reload removes old exported action listeners.
- Default setup runs before wake.
- Mount runs after wake.
- Returned setup and mount cleanups run during destruction.
- Exported destroy runs on reload and disconnect.
- `dw/loaded` and `dw/ready` fire after successful mount.

### Browser integration test

Add at least one Playwright component fixture that proves:

- a browser can import the generated Blob module,
- bare component values initial-render,
- an exported action calls `component.set()`,
- the DOM updates,
- explicit wrapper-state pURLs still work beside component values.

Blob import behavior is part of the browser contract and must not be covered
only by the Bun/Happy DOM unit environment.

## Acceptance Criteria

- `load()` imports one owned `<script type="module" data-dw>` from loaded HTML.
- The extracted module script is absent from inserted DOM.
- Named value exports initialize `wrapper.component`.
- `wrapper.component` supports at least `get`, `set`, `register`, and
  deterministic cleanup.
- Bare-name `$` and `*` bindings consume component Sources.
- Component `set()` publishes updates to bound DOM and directives.
- Explicit pURL-shaped bindings retain current behavior.
- Existing `@` dispatch behavior remains unchanged.
- Exported actions register against existing action topics and are torn down.
- Setup, mount, and destroy hooks run in the documented order.
- Existing legacy loaded views continue working.
- One real browser integration component demonstrates the complete MVP.
- Documentation explains component values versus wrapper `data-*` state.

## Proposed Implementation Plan

Implementation should proceed in small, independently reviewable phases. Do
not begin the next phase until the previous phase's behavior and naming have
been reviewed.

### Phase 1: Module Discovery and Import

Scope:

- Add owned `script[type="module"][data-dw]` discovery to the HTML loader.
- Enforce zero-or-one module and reject mixed owned `dw/controller`.
- Extract the script, import it through a Blob URL, and revoke the URL.
- Validate only the basic module discovery/import path.
- Do not expose exports to bindings yet.

Review checkpoint:

- Confirm ownership rules, conflict behavior, Blob import behavior, and error
  phases.
- Confirm existing legacy HTML/controller paths still pass.

Deliverable:

- Loader and tests can import a component module and observe its namespace.

### Phase 2: ComponentScope Core

Scope:

- Add the minimal ComponentScope type/class.
- Normalize `state` and named value exports.
- Implement `get`, `set`, component Station, and `source`.
- Assign and destroy `wrapper.component`.
- Do not add exported actions or hooks yet.

Review checkpoint:

- Confirm public naming, mutable-copy semantics, missing-name behavior, and
  destruction ownership.

Deliverable:

- A loaded module produces a mutable, reactive component scope independent of
  DOM bindings.

### Phase 3: Bare `$` and `*` Binding Resolution

Scope:

- Branch before `p(value)` for bare-name `$` and `*` values when
  `wrapper.component` exists.
- Feed component bindings through the existing Source pipeline.
- Preserve all pURL and `@` behavior.
- Add `$text`, `*if`, and `*list` coverage against component values.

Review checkpoint:

- Confirm the scoped breaking change is understandable and that row-relative
  bindings inside component-backed lists still behave correctly.

Deliverable:

- Component exports render and update through normal token attributes.

### Phase 4: Exported Actions and Registration Cleanup

Scope:

- Make `wrapper.register()` return a batch `Off`.
- Normalize and register exported `actions`.
- Supply the documented action context.
- Record action cleanup on the ComponentScope.

Review checkpoint:

- Confirm actions remain a thin layer over existing event topics and payloads.
- Confirm reload does not accumulate handlers.

Deliverable:

- A component module can colocate event handlers with its markup.

### Phase 5: Setup, Mount, and Destroy Lifecycle

Scope:

- Run default setup before wake.
- Run mount after wake.
- Record cleanup functions returned by setup and mount.
- Run deterministic destruction on reload and disconnect.
- Add phased lifecycle errors.

Review checkpoint:

- Confirm lifecycle ordering against a real component and assess whether setup
  needs additional tools.

Deliverable:

- Loaded components own their full setup and teardown lifecycle.

### Phase 6: First Real Component and Documentation

Scope:

- Convert one small showcase component to the new module syntax.
- Add the Playwright end-to-end fixture.
- Update framework documentation to make loaded HTML components the preferred
  authoring model.
- Record concrete pain points without solving them automatically.

Review checkpoint:

- Decide the next feature from actual component authoring experience.

Possible next candidates, deliberately not preselected:

- `derive()` and `effect()`,
- props/input normalization,
- component-local helper exposure,
- array convenience methods,
- component binding transforms,
- style conventions,
- relative imports,
- load cancellation or caching,
- migration/deprecation of legacy controller paths.

Deliverable:

- A functioning, documented MVP that can guide the next design decision.
