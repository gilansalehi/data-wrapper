# data-wrapper

Zero-dependency, HTML-first reactivity built on a single Web Component.
Components are plain ES modules; views bind DOM effects to their live exports
through three tokens.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"></script>
<data-wrapper src="counter.html"></data-wrapper>
```

```html
<!-- counter.html -->
<script type="module" data-component data-module="@view/counter">
    export let count = 0;
    export const doubled = () => count * 2;
    export function inc(event) { count += Number(event.target.value); }
</script>

<button @click="inc?prevent" value="1">+1</button>
<output $text="count"></output>
<output $text="doubled"></output>
```

No build step, no virtual DOM, no JSX. Named exports are the component's normal
state surface. Mutate `count` inside an action; every binding that reads it
updates on the next flush.

## Three tokens

| Token | Direction         | Purpose                                            |
| ----- | ----------------- | -------------------------------------------------- |
| `$`   | binding → DOM     | `$prop="name"` sets `el[prop]` from a binding      |
| `*`   | binding → layout  | `*directive="name"` runs a structural directive    |
| `@`   | event → action    | `@event="name"` calls a module function on event   |

Bindings resolve against the current component context:

- **Bare name** (`view`) checks the per-mount instance, then named module exports
- **Relative path** (`./done`) reads from the nearest surrounding `*list` item

The default export is optional. When a view needs state unique to each mounted
wrapper, it may export a factory whose returned object overlays the module
scope. The factory receives the wrapper's full load URL and parsed query
parameters:

```js
export const label = 'Counter';

export default ({ wrapper, url, params }) => {
    let count = Number(params.get('start') ?? 0);
    return {
        get count() { return count; },
        increment() { count += 1; },
    };
};
```

```html
<data-wrapper src="counter.html?start=5"></data-wrapper>
```

Here `count` and `increment` are per-wrapper bindings, while `label` comes from
the module. If both surfaces define the same name, the instance value wins.
Query parameters configure each wrapper independently without creating another
module instance.

`data-module` gives the component module a stable import name:

```js
import { open } from '@view/nav';
```

The loader maps that name to the component's Blob URL before importing it.
Repeated mounts reuse the same module namespace and invoke the optional
default factory once per wrapper.

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

`*list` reads an array from the component context, reconciles by item identity
(default key `id`, override with `?key=field`), and creates a nested binding
context for each rendered item. Existing items update in place; new items wake;
missing items tear down.

## Built-in formatters

`onoff` — `?onoff=truthy:falsy` picks one label or the other. Register more
through `DW_FORMATTERS.set(name, fn)`.

## Project layout

```
src/lib/
    utils.ts       binding parser, readPath, DOM helpers
    engine.ts      station primitives, wake/wire/bind, reconcile, *list/*if
    component.ts   ComponentRuntime, action(), flush()
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

## License

MIT
