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

## Status

Alpha. The PoC supports component modules with synchronous reads and actions.
Async actions, `mount`/`destroy` lifecycle hooks, pURL `/wrapperState` paths,
cross-wrapper addressing, custom protocols, and the wrapper-side state API
(`register`/`put`/`patch`/`push`/`pull`) are tracked features, not yet built.

## License

MIT
