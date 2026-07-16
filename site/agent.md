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

Functions used as values are called when bindings are read. For example,
`$text="doubled"` calls `doubled()` if `doubled` is an exported function.
Event bindings are different: `@click="increment"` invokes the function when
the event fires.

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

## Inputs and Slots

Query params on `src` become factory `props`:

```html
<data-wrapper src="/views/counter.html?start=5&label=%22Demo%22"></data-wrapper>
```

Literal assigned values are parsed with `JSON.parse` when possible, so `5`,
`true`, `null`, arrays, objects, and quoted strings recover their JSON types.
If a param resolves to a parent binding, the prop is a stable function reader.

Captured light-DOM children are grouped by their ordinary `slot` attribute and
passed to the factory as `slots`. The `slot` attribute is a grouping key; this
is not Shadow DOM slotting.

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
