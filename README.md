# data-wrapper

Zero-dependency, HTML-first reactivity built on a single Web Component.
Components are plain ES modules; views bind to their live exports through
three tokens.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"></script>
<data-wrapper src="counter.html"></data-wrapper>
```

```html
<!-- counter.html -->
<script type="module" data-component="counter">
    export let count = 0;
    export const doubled = () => count * 2;
    export function inc(event) { count += Number(event.target.value); }
</script>

<button @click="inc?prevent" value="1">+1</button>
<output $text="count"></output>
<output $text="doubled"></output>
```

No build step, no virtual DOM, no JSX. Mutate `count` inside an action; every
binding that reads it updates on the next flush.

## Three tokens

| Token | Direction         | Purpose                                            |
| ----- | ----------------- | -------------------------------------------------- |
| `$`   | state → DOM       | `$prop="name"` sets `el[prop]` to a module export  |
| `*`   | state → structure | `*directive="name"` runs a structural directive    |
| `@`   | event → action    | `@event="name"` calls a module function on event   |

Binding values resolve in priority order:

- **Bare name** (`view`) looks up a component export
- **Relative path** (`./done`) reads from the surrounding `*list` row's item

## Directives on `<template>`

`*list` and `*if` live on `<template>` elements — the template's body is what
renders.

```html
<ul>
    <template *list="view">
        <li $class="./done?onoff=done:active">
            <span $text="./task"></span>
            <template *if="./done">
                <strong>done</strong>
            </template>
        </li>
    </template>
</ul>
```

`*list` reconciles by item identity (default key `id`, override with
`?key=field`). Existing rows update in place; new rows wake; missing rows tear
down.

## State as DOM

`<data-wrapper>` keeps a `Proxy` over its own `data-*` attributes and watches
external edits via `MutationObserver`. Use `$data-*` on the wrapper to project
a component export onto its dataset so CSS attribute selectors can react:

```html
<data-wrapper id="nav" src="nav.html" $data-nav-open="open"></data-wrapper>
```

```css
#nav[data-nav-open="true"] .hamburger { /* … */ }
```

Open DevTools and watch the attribute flip with state.

## Built-in formatters

`onoff` — `?onoff=truthy:falsy` picks one label or the other. Register more
through `DW_FORMATTERS.set(name, fn)`.

## Project layout

```
src/lib/
    utils.ts       pURL parser, readPath, DOM helpers
    engine.ts      station primitives, wake/wire/bind, reconcile, *list/*if
    component.ts   ComponentRuntime — output cache, action delegation, flush
    element.ts     <data-wrapper> custom element + load()
    index.ts       re-exports
```

## Scripts

```sh
bun install
bun run serve       # dev server
bun run build       # ESM + minified IIFE in /dist
bun run typecheck   # tsc --noEmit
```

## State across components

State that's shared between components lives in plain ES modules. Mark
exported mutators with `action()` so calls from anywhere trigger a re-derive:

```js
// /state/todos.js
import { action } from 'data-wrapper';

export let todos = [];
export const { addTodo, removeTodo } = action({
    addTodo:    item => { todos = [...todos, item]; },
    removeTodo: id   => { todos = todos.filter(t => t.id !== id); },
});
```

See [STATE.md](./STATE.md) for the full guide — local state, shared state,
async actions, manual `flush()`, and the idempotence rules.

## Status

Alpha. Component modules support local state via `export let`, cross-module
shared state via `action()`/`flush()`, sync and async actions, and the
`*list` / `*if` directives on `<template>`. `mount(ctx)` / `destroy(ctx)`
lifecycle hooks, pURL `/wrapperState` paths, cross-wrapper addressing, and
custom protocols are tracked features, not yet built.

## License

MIT
