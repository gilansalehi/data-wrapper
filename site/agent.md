# data-wrapper Agent Guide

This file is for coding agents building with data-wrapper. Prefer this file,
`/llms-full.txt`, `README.md`, and `src/lib/` over older tickets or design
briefs. Some planning documents contain rejected syntax.

## Source of Truth

- Runtime behavior lives in `src/lib/`.
- Public package exports live in `src/lib/index.ts`.
- Public guide pages live in `site/views/docs/`.
- Showcase examples live in `site/views/showcase/`.
- Public agent docs live at `/llms.txt`, `/llms-full.txt`, and `/agent.md`.

If a claim conflicts with source, source wins.

## Distribution

For browser use, load the alpha build from the project domain:

```html
<script src="https://data-wrapper.org/dist/data-wrapper.min.js"></script>
```

When component modules import from `data-wrapper`, map the package name to the
ESM build:

```html
<script type="importmap">
{
    "imports": {
        "data-wrapper": "https://data-wrapper.org/dist/data-wrapper.js"
    }
}
</script>
```

The framework script may be hosted on `data-wrapper.org`, but component view
URLs still resolve on the consuming app's origin. For example,
`<data-wrapper src="/views/home.html">` on `gilansalehi.com` loads
`https://gilansalehi.com/views/home.html`.

## Do Not Invent APIs

data-wrapper has exactly three built-in directives:

- `*list`
- `*if`
- `*src`

Do not write `*for`, `*each`, `*match`, `*show`, `x-if`, `v-for`, JSX, or
template interpolation. Bindings are HTML attributes, never text syntax.

Correct:

```html
<output $text="count"></output>
<button @click="increment">+</button>
<template *list="todos">
    <li $text="./task"></li>
</template>
```

Incorrect:

```html
{{ count }}
<li *for="todo in todos"></li>
<button onClick={increment}></button>
```

## View Files

A component view is an HTML file. It may contain one module script:

```html
<script type="module" data-module="@view/counter">
    export let count = 0;
    export function increment() {
        count += 1;
    }
</script>

<button @click="increment">+</button>
<output $text="count"></output>
```

Rules:

- Use a unique `data-module` name for each component module.
- A view may contain at most one `script[type="module"][data-module]`.
- The module script can be inline or use `src`.
- Named exports are shared module state.
- A default export must be a factory function if present.
- The factory may return an object of per-wrapper instance bindings.
- Instance bindings shadow module exports with the same name.

## Project Structure and Routing

data-wrapper has no built-in router and no history-API integration. Do not
build or add one by default. For a multi-page project, the platform-native
default is one physical HTML document per route, deployed as-is by a static
host:

- Every public route is its own real `<route>/index.html` document, not a
  client-side match against a single entrypoint. That gets you direct-link
  support, native Back/Forward, and the host's ordinary 404 behavior for
  free, with no router code.
- Root-relative URLs (`/about/`, `/views/...`) resolve the same from every
  route, unlike relative paths.
- Everything under the public root is fetchable by any browser. Never place
  secrets there; gate private data behind an authenticated API instead.

Use `*src` to share chrome (nav, theme, page outlet) across route documents
instead of duplicating it, without turning it into a router:

```html
<template *src="currentView"></template>
```

A non-empty string resolved by that binding loads another view as a child
`<data-wrapper>`; the route document supplies which view, the shared layout
just renders the outlet. How a project names the views or organizes its
`views/` folder is a project-level choice, not a framework contract — there
is no required directory layout or attribute naming scheme.

A client-side router is only worth reaching for when the app has genuinely
stateful screens that cannot be represented by deployed files. A finite set
of content pages should stay physical.

## Reactivity

data-wrapper does not track property reads. It re-reads active bindings during a
flush.

Use `action()` for event handlers or shared writers:

```js
import { action } from 'data-wrapper';

export let count = 0;
export const increment = action(() => {
    count += 1;
});
```

If a mutation happens outside an action, call `flush()`:

```js
import { flush } from 'data-wrapper';

setTimeout(() => {
    count += 1;
    flush();
}, 1000);
```

`flush()` updates every mounted component runtime, not just the caller's.
Importing a shared `action()`-wrapped writer from another module and calling
it is therefore a valid way to keep sibling components in sync — see
Coordinating Sibling Components below.

Functions used as values are called when bindings are read. For example,
`$text="doubled"` calls `doubled()` if `doubled` is an exported function.
Event bindings are different: `@click="increment"` invokes the function when
the event fires.

## Events

`@event="name"` always wraps the native event. The handler — whether
invoked directly or reached through an emitted event — receives a
`CustomEvent` whose `detail` holds `originalEvent` (the real DOM event),
`path`, `isRel`, and `item` (the nearest `*list` row, or `undefined` outside
a list). Do not assume the argument is the native event.

```js
export const removeTodo = action(event => {
    const item = event.detail.item;
    todos = todos.filter(todo => todo.id !== item.id);
});
```

If no exported function matches `name`, the same event is dispatched as a
bubbling DOM `CustomEvent` named `name` instead of being invoked directly —
useful for child-to-parent signaling. It also means a misspelled action name
fails silently rather than throwing; double-check action names against their
exports.

## Binding Paths

Use data-wrapper path syntax:

- `name` reads from the nearest row that owns `name`, then parent rows, then the
  component instance or module.
- `./name` reads from the nearest row only.
- `../name` reads from the parent row. Repeat `../` for higher row scopes.
- `/name` reads from the component root scope and bypasses rows.
- `//wrapperId/name` reads from another loaded `<data-wrapper id="wrapperId">`.
- Query params apply formatters or event modifiers.

Inside `*list`, use `./` for row-relative data:

```html
<template *list="todos">
    <li>
        <input type="checkbox" $checked="./done" @change="toggle">
        <span $text="./task"></span>
    </li>
</template>
```

## Structural Templates

`*list`, `*if`, and `*src` live on `<template>` elements. Keep structural
template bodies to one root element. The runtime clones the first element child
from a structural template.

A plain `src` attribute on `<data-wrapper>` is read once, when the wrapper
connects; it does not react to later changes. `<template *src="binding">` is
different: it re-reads its binding on every flush, so the outlet can swap to
a different view, project different children, or fall back to template
content as the bound value changes over time.

## Inputs and Slots

Query params on `src` become factory `props`:

```html
<data-wrapper src="/views/counter.html?start=5&label=%22Demo%22"></data-wrapper>
```

Each param's right-hand side is tried as a binding path against the parent
context first. If it resolves, the prop is a stable function reader — call
it to get the current value. Only when nothing resolves does the value fall
back to a literal parsed with `JSON.parse`, so `5`, `true`, `null`, arrays,
objects, and quoted strings recover their JSON types.

This means `?entries=entries` does not read as the literal string
`"entries"` if the parent has a binding named `entries` — it resolves to
that binding instead, and the child receives a live reader function, not a
static string. Quote a value (`?label=%22entries%22`) to force a literal
when that ambiguity matters.

Captured light-DOM children are grouped by their ordinary `slot` attribute and
passed to the factory as `slots`. The `slot` attribute is a grouping key; this
is not Shadow DOM slotting.

## Coordinating Sibling Components

Do not coordinate sibling `<data-wrapper>` components by querying or
mutating each other's rendered DOM. That is an imperative escape hatch, not
the framework's integration surface, and it breaks the moment markup changes.

Put shared data in one place instead, and pick based on the relationship:

- **No ownership relationship (peers):** a shared ES module exporting state
  and `action()`-wrapped writers. Every component that imports from it reads
  the same live bindings; calling an imported writer flushes every mounted
  component that reads the affected exports. This is the default choice for
  catalogs, relationship state, and view-model functions shared across
  components that don't compose each other.
- **One component only needs to read another's state:** `//wrapperId/name`
  cross-wrapper reads. Read-only, and only reaches component root scope.
- **A parent already composes a child directly:** pass data down through
  `src` query params instead of reaching for shared module state.

## Security Defaults

- Treat `src` and string values passed to `*src` as trusted code inputs.
- Loaded views must be same-origin.
- Never flow user input into `src` or `*src`.
- Do not serve user uploads from the app origin.
- Use `$text` for text.
- `$innerHTML` and `$outerHTML` are blocked.
- `$unsafeHTML` and `$srcdoc` are explicit raw-HTML opt-ins.
- Bound URL attributes use an allowlist. Unknown schemes are dropped.

## Public Imports

Use these package exports:

```js
import {
    action,
    flush,
    DW_DIRECTIVES,
    DW_FORMATTERS,
    emit,
    nearestItem,
    on,
    p,
    pURL,
    q,
} from 'data-wrapper';
```

Do not import private files from `src/lib/` in application code.
