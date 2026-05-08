# data-wrapper

A zero-dependency, HTML-first reactivity engine built on native Web Components.

No build step. No virtual DOM. No proprietary template language. Drop in a script tag and your HTML becomes reactive.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"></script>
```

---

## The Philosophy

The framework is the browser. Every design decision defers to a native platform primitive:

- **State** lives in `data-*` attributes — visible in DevTools, targetable with CSS attribute selectors
- **Reactivity** is a Proxy over `dataset` — reads parse JSON, writes serialize it
- **DOM reflection** uses MutationObserver — external attribute changes propagate automatically
- **Event routing** is the browser's own bubbling — one delegated listener per event type per wrapper
- **Binding syntax** is parsed by `new URL()` — the browser is the DWRL parser
- **Templates** are native `<template>` tags — zero framework overhead

---

## Quick Start

```html
<data-wrapper id="counter" data-count="0">
  <p>Count: <strong $text="/count"></strong></p>
  <button @click="count/inc">+1</button>
</data-wrapper>

<script src="/dist/data-wrapper.js" type="module"></script>
<script>
  customElements.whenDefined('data-wrapper').then(() => {
    const counter = document.getElementById('counter');
    counter.register({
      'count/inc': () => counter.put('count', n => Number(n) + 1)
    });
  });
</script>
```

---

## Core Concepts

### State = `data-*` attributes

The `<data-wrapper>` element's `data-*` attributes **are** the state store. The `state` property is a Proxy that adds JSON round-tripping on top of the native `dataset`:

```js
app.state.user  = { name: 'Ali' };  // serialises → data-user='{"name":"Ali"}'
app.state.user;                      // → { name: 'Ali' }
app.state.count = 42;                // data-count="42"
```

Because state is just attributes:
- **DevTools inspection** — watch state change live in the Elements panel
- **CSS targeting** — `data-wrapper[data-theme="dark"] { … }`
- **Bidirectional sync** — setting `el.dataset.count = '5'` from any script triggers the same reactive update as `app.put('count', 5)`

### Tokens

Three attribute prefixes are the entire declarative API:

| Token | Direction | Example |
|-------|-----------|---------|
| `$`   | State → DOM property | `$text="/username"` |
| `_`   | State → DOM attribute *(in progress)* | `_data-active="/isActive"` |
| `@`   | DOM event → registered handler | `@click="todo/remove"` |

### DWRL — Data Wrapper Resource Locator

Binding values are URL-shaped addresses parsed by `new URL()`. The token determines intent.

| Syntax | Resolves to |
|--------|-------------|
| `/key` | Wrapper-root state key |
| `/user/name` | Nested: `state.user.name` |
| `./key` | Item-scoped (inside `$list` only) |
| `//other-id/key` | Cross-wrapper *(in progress)* |

**Formatters** via query params, applied left to right:

```html
<span $text="/price?format=currency"></span>
<span $text="/name?format=trim&format=upper"></span>
<span $text="/items?format=count"></span>
```

Built-in: `count`, `fallback`, `json`, `upper`, `lower`, `currency`, `date`, `trim`, `bool`, `onoff`, `yesno`

Register custom formatters:

```js
import { VP_FORMATTERS } from 'data-wrapper';
VP_FORMATTERS.set('initials', v => String(v).split(' ').map(w => w[0]).join(''));
```

---

## Binding Reference

### Text & properties

```html
<span $text="/username"></span>
<div  $html="/bio"></div>       <!-- ⚠ XSS risk: only bind trusted HTML -->
<input $value="/draft">
<input type="checkbox" $checked="/notifications">
<button $disabled="/isLoading">Submit</button>
<a $href="/profileUrl">Profile</a>
<img $src="/avatarUrl" $alt="/name">
```

Any DOM property works — `$prop` maps to `el[prop]`. Aliases: `$text` → `textContent`, `$html` → `innerHTML`.

### Class binding

```html
<!-- State value used directly as class string -->
<li class="item" $class="./status"></li>
<!-- state.status = "done" → class="item done" -->

<!-- Boolean formatter → class name -->
<span class="badge" $class="/isActive?format=onoff"></span>
<!-- true → class="badge on" | false → class="badge off" -->
```

### Events & handlers

`@event="topic/name"` wires a native DOM event to a registered handler via delegation — one listener per event type on the wrapper, zero per-element listeners.

```html
<button @click="todo/remove" $value="./id">Delete</button>
<form   @submit="todo/add">…</form>
<input  @input="search/update">
<button @click="filter/set" data-val="active">Active</button>
```

Handlers receive a **CustomEvent**. The original browser event is in `e.detail`:

```js
app.register({
  'todo/add':      e => { e.detail.preventDefault(); /* e.detail = submit event */ },
  'todo/remove':   e => { const id = Number(e.detail.delegateTarget.value); /* … */ },
  'filter/set':    e => { app.put('filter', e.detail.delegateTarget.dataset.val); },
  'search/update': e => { app.put('query', e.detail.target.value); },
});
```

| Property | Value |
|----------|-------|
| `e.detail` | Original browser event |
| `e.detail.delegateTarget` | Element carrying the `@` attribute |
| `e.detail.target` | Native event target |

### List rendering

```html
<ul $list="/todos" data-empty="empty-tpl-id">
  <template>
    <li class="item" $class="./status">
      <input type="checkbox" $checked="./done" @change="todo/toggle" $value="./id">
      <span $text="./task"></span>
      <button @click="todo/remove" $value="./id">✕</button>
    </li>
  </template>
</ul>
```

The reconciler diffs by `item.id`. Override with `?key=`: `$list="/users?key=uuid"`.

Inside `<template>`, `./path` is item-scoped — reads from the row's data object, not wrapper state.

If a list is empty, `data-empty` selects a named empty-state template. When omitted,
`vp-empty` is used. Template lookup prefers `VP_TEMPLATES`, then a page-level
`<template id="...">`, then the small built-in defaults.

---

## Component API

### `register(actions)`

Maps event topic strings to handler functions. Called from script or inline via `onload`:

```js
app.register({
  'todo/add':    e => { … },
  'todo/remove': e => { … },
});
```

```html
<!-- Inline via native onload attribute -->
<data-wrapper onload="this.register({ 'count/inc': () => this.put('count', n => n + 1) })">
```

### State mutation

```js
app.put('count', 1);                              // set
app.put('count', n => Number(n) + 1);             // updater function
app.patch('user', { name: 'Ali' });               // shallow merge
app.push('todos', { id: 1, task: 'Buy milk' });   // append to array
app.pull('todos', 1);                             // remove where item.id === 1
app.pull('todos', t => t.done);                   // remove by predicate
```

### System events

```js
// Fires on document when any wrapper connects
document.addEventListener('data-wrapper:load', e => console.log('mounted', e.detail));

// Fires on the wrapper whenever state changes via put/patch/push/pull
app.addEventListener('data:sync', e => {
  if (e.detail.key === 'todos') recompute();
});
```

### Computed state pattern

`data:sync` + `put` = reactive derived state, no dependency tracking required:

```js
app.addEventListener('data:sync', () => {
  app.put('fullName', `${app.state.firstName} ${app.state.lastName}`);
  app.put('activeCount', (app.state.todos || []).filter(t => !t.done).length);
});
```

### Utility exports

```js
import { q, qcb, on, emit, VP_FORMATTERS, VP_TEMPLATES, VP_DEFAULT_TEMPLATES, CONFIG } from 'data-wrapper';

q('.item');                           // [...querySelectorAll('.item')]
qcb('.item', el => el.textContent);   // query + map
on('click', handler, '.btn');         // delegated listener, returns unsubscribe fn
emit('my:event', payload, el);        // CustomEvent dispatch
```

---

## Configuration

Override defaults before the script loads:

```html
<script>
  window.VP_CUSTOM_CONFIG = {
    TOKENS: { BIND: ':', ADD: '+', EVT: '#' }
  };
</script>
<script src="/dist/data-wrapper.js" type="module"></script>
```

---

## Architecture

```
src/lib/
├── utils.ts      — q, qcb, emit, on
├── registry.ts   — CONFIG, VP_FORMATTERS, VP_TEMPLATES, PROP_ALIASES, sync
├── engine.ts     — applyBinding, applyItemBindings, reconcile
├── wire.ts       — parsePath, wake, subscribe, ensureDelegation
└── component.ts  — DataWrapper class
```

**Wiring (O(N), once at mount):** `wake()` walks the subtree, reads `$`/`_`/`@` attributes, builds `_subs` — a flat map of `{ stateKey → UpdateConfig[] }`.

**Reaction (O(1) per key):** `_broadcast(key, val)` looks up `_subs[key]` and writes only to subscribed nodes.

**Delegation:** One `addEventListener` per event type on the wrapper. `@event="topic"` dispatches a CustomEvent named `topic` on the wrapper when the native event bubbles up.

---

## Status

| Feature | Status |
|---------|--------|
| `$` bindings (text, props, attrs) | ✅ |
| `@` event delegation | ✅ |
| `register()` + `put/patch/push/pull` | ✅ |
| `$list` reconciler with identity diffing | ✅ |
| `./` item-scoped paths | ✅ |
| `?format=` pipe chain | ✅ |
| `?key=` identity override | ✅ |
| `data:sync` computed state pattern | ✅ |
| Cross-wrapper `//id/key` | 🚧 In progress |
| `_` additive token | 🚧 In progress |
| `$match` / `$if` directives | 🚧 Planned |
| `api://` remote fetch | 🚧 Planned |
