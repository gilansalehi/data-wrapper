# data-wrapper

Zero-dependency, HTML-first reactivity built on a single Web Component. State
lives in `data-*` attributes; three tokens wire the rest.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"></script>

<data-wrapper data-count="0">
  <button @click="dec">−</button>
  <output $text="/count"></output>
  <button @click="inc">+</button>
</data-wrapper>

<script type="module">
  const counter = document.querySelector('data-wrapper');
  counter.register({
    inc: () => counter.put('count', n => Number(n) + 1),
    dec: () => counter.put('count', n => Number(n) - 1),
  });
</script>
```

No build step, no virtual DOM, no JSX. Open DevTools and watch `data-count`
change.

## Mental model

The DOM is declarative. The `<data-wrapper>` element owns the logic.

| Token | Direction         | Purpose                                                 |
| ----- | ----------------- | ------------------------------------------------------- |
| `$`   | state → DOM       | `$prop="/path"` sets `el[prop] = value`                 |
| `*`   | state → structure | `*directive="/path"` runs a structural directive        |
| `@`   | event → handler   | `@event="topic"` delegates a native event to a topic    |

Paths are parsed by the browser's native `new URL()`:

- `/key` — wrapper-root state
- `./key` — item-scoped (inside `*list` templates)
- `?format=name` — applies a named formatter; chain with `&format=…`
- `?key=field` — overrides the identity key for `*list` reconciliation

## State API

```js
wrapper.put('count', 1);                  // set, or n => n + 1
wrapper.patch('user', { name: 'Ali' });   // shallow merge
wrapper.push('todos', { id: 1, … });      // array append
wrapper.pull('todos', t => t.done);       // array filter (or by id)
wrapper.register({ 'topic': handler });   // event topic handlers
```

Every mutation routes through `put()`, writes through a `Proxy` into
`dataset`, broadcasts to compiled subscribers, and emits `data:sync`. External
`data-*` attribute changes in DevTools or via JS go through the same pipeline
via `MutationObserver`.

## Lists

```html
<ul *list="/todos" data-empty="dw-empty">
  <template>
    <li $class="./status">
      <input type="checkbox" $checked="./done" @change="todo/toggle">
      <span $text="./task"></span>
    </li>
  </template>
</ul>
```

`*list` reconciles by item identity (default key `id`), reuses existing rows,
and broadcasts updated values into already-compiled row subscribers. Empty
state renders a referenced `<template>` or one of the built-ins (`dw-empty`,
`dw-missing`, `dw-loading`, `dw-error`).

## Loading from `src`

```html
<data-wrapper src="/controllers/widget.js" data-name=""></data-wrapper>
<data-wrapper src="/views/section.html"></data-wrapper>
```

A `.js` / `.mjs` source is imported and its `default` export is called with
the wrapper. An HTML source replaces `innerHTML` and re-wakes.

## Built-in formatters

`count`, `fallback`, `json`, `upper`, `lower`, `currency`, `date`, `trim`,
`bool`, `onoff`, `yesno`. Register your own via `DW_FORMATTERS.set(name, fn)`.

## Project layout

```
src/lib/
  component.ts   custom element, state Proxy, MutationObserver, register/put/patch/push/pull
  wire.ts        wake() + wire() — compiles attributes into subscribers
  engine.ts      bind / watch / broadcast / reconcile / *list directive
  registry.ts    types, formatters, prop aliases, directive registry, built-in templates
  utils.ts       q / emit / on / delegateCb
```

`FRAMEWORK.md` documents the render lifecycle, subscription model, and
architectural pressure points.

## Scripts

```sh
bun install
bun run serve         # dev server (serve.ts)
bun run build         # ESM + minified IIFE in /dist
bun run typecheck     # tsc --noEmit
bun run test:unit     # bun test tests/unit/
bun run test:e2e      # playwright (builds first)
bun run review        # typecheck + unit + e2e
```

## License

MIT
