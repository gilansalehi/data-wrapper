# data-wrapper

A zero-dependency, HTML-first reactivity engine built on native Web Components.

No build step for consumers. No virtual DOM. No proprietary template language. Drop in a script tag and your HTML becomes reactive.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"></script>
```

---

## The Philosophy

The framework is the browser. Every design decision defers to a native platform primitive:

- **State** lives in `data-*` attributes — the browser's own dataset API, visible and editable in DevTools
- **Reactivity** is a Proxy over `dataset` — reads parse JSON, writes serialize it
- **DOM reflection** is a MutationObserver — external attribute changes automatically propagate
- **Event routing** uses the browser's own event bubbling — no synthetic event system
- **URL parsing** powers the binding syntax — `new URL()` is the entire DWRL parser
- **Templates** are inert `<template>` tags — standard HTML, zero framework overhead

The result: a plug-and-play script that makes any HTML page reactive according to a simple, declarative schema.

---

## Quick Start

```html
<data-wrapper id="app" data-count="0">
  <p>Count: <strong $text="/count"></strong></p>
  <button @click="action:count/increment">+1</button>
</data-wrapper>

<script src="/dist/data-wrapper.js" type="module"></script>
<script>
  customElements.whenDefined('data-wrapper').then(() => {
    const app = document.getElementById('app');
    app.register({
      'count/increment': () => app.put('count', n => Number(n) + 1)
    });
  });
</script>
```

---

## Core Concepts

### State = `data-*` attributes

The `<data-wrapper>` element's `data-*` attributes **are** the state store. The `state` property is a Proxy that adds JSON round-tripping on top of the native `dataset`:

```js
app.state.user = { name: 'Ali' };  // serialises to data-user='{"name":"Ali"}'
app.state.user;                     // → { name: 'Ali' } (parsed back)
app.state.count = 42;               // data-count="42"
```

Because state is just attributes, you get:
- **DevTools inspection** — watch state change live in the Elements panel
- **CSS targeting** — `[data-theme="dark"] { background: #111 }`
- **Bidirectional sync** — setting `el.dataset.count = '5'` from any script triggers the same reactive update as `app.put('count', 5)`

### Tokens

Three attribute prefixes are the entire declarative API:

| Token | Name | Direction | Example |
|-------|------|-----------|---------|
| `$`   | Bind | State → DOM | `$text="/username"` |
| `_`   | Additive class | State → className *(in progress)* | `_class="/isActive"` |
| `@`   | Event | DOM → action | `@click="action:todo/remove"` |

### DWRL — Data Wrapper Resource Locator

Binding values are URL-shaped addresses parsed by the browser's native `new URL()`. The token determines intent (read vs. write), so no verb is needed in the string.

**Path resolution:**

| Syntax | Resolves to |
|--------|-------------|
| `/key` | Wrapper-root state |
| `/user/name` | Nested: `state.user.name` |
| `./key` | Item-scoped (inside `$list` only) |
| `//other-id/key` | Cross-wrapper *(in progress)* |

**Formatters** via query params, applied left to right:

```html
<span $text="/price?format=currency"></span>
<span $text="/name?format=trim&format=upper"></span>
<span $text="/count?format=count"></span>
```

Built-in formatters: `count`, `fallback`, `json`, `upper`, `lower`, `currency`, `date`, `trim`, `bool`, `onoff`, `yesno`.

Register custom formatters before mount:
```js
import { VP_FORMATTERS } from 'data-wrapper';
VP_FORMATTERS.set('initials', v => String(v).split(' ').map(w => w[0]).join(''));
```

---

## Binding Reference

### Text & properties

```html
<span $text="/username"></span>
<div  $html="/bio"></div>
<input $value="/draft">
<input type="checkbox" $checked="/notifications">
<button $disabled="/isLoading">Submit</button>
<a $href="/profileUrl">Profile</a>
<img $src="/avatarUrl" $alt="/name">
```

Any DOM property or attribute works — `$` + the property name. Shorthands: `$text` → `textContent`, `$html` → `innerHTML`, `$class` → `className`.

### Class binding

```html
<!-- Value-as-class: state value used as class string, merged with static classes -->
<li class="item" $class="./status"></li>
<!-- state.status = "active" → class="item active" -->

<!-- Boolean formatters -->
<span class="badge" $class="/isActive?format=onoff"></span>
<!-- true → class="badge on", false → class="badge off" -->
```

The static `class` attribute is always preserved as the base. The dynamic `$class` value is merged on top.

### Events & actions

`@event="action:path/name"` wires an event to a registered action handler. One delegated listener per event type is attached to the wrapper — no per-element listeners.

```html
<button @click="action:todo/remove" $value="./id">Delete</button>
<form   @submit="action:todo/add">…</form>
<input  @input="action:search/update">
<button @click="action:filter/set" data-val="active">Active</button>
```

Action handlers receive the original browser event, augmented with:
- `e.delegateTarget` — the element carrying the `@` attribute
- `e.item` — the nearest `_vItem` (item context inside `$list`)

### List rendering

```html
<ul $list="/todos" data-empty="empty-template-id">
  <template>
    <li class="item" $class="./status">
      <input type="checkbox" $checked="./done" @change="action:todo/toggle">
      <span $text="./task"></span>
      <button @click="action:todo/remove">✕</button>
    </li>
  </template>
</ul>
```

The reconciler diffs by `item.id`, performing only minimum DOM mutations. Inside the template, `./path` paths are item-scoped — they read from the row's item object, not wrapper state.

---

## Component API

### `register(actions)`

Map `action://` path strings to handler functions. Called from script or inline via `onload`:

```js
app.register({
  'todo/add':    e => { e.preventDefault(); /* … */ },
  'todo/remove': e => app.pull('todos', e.item?.id),
  'filter/set':  e => app.put('filter', e.delegateTarget.dataset.val),
});
```

```html
<!-- Inline via native onload -->
<data-wrapper onload="this.register({ 'count/inc': () => this.put('count', n => n + 1) })">
```

### State mutation

```js
app.put('count', 1);                         // set
app.put('count', n => Number(n) + 1);        // updater function
app.patch('user', { name: 'Ali' });          // shallow merge
app.push('todos', { id: 1, task: 'Buy milk' }); // append
app.pull('todos', 1);                        // remove by id
app.pull('todos', t => t.done);              // remove by predicate
```

### Events

```js
// Fires when a DataWrapper finishes connectedCallback
document.addEventListener('data-wrapper:load', e => console.log(e.detail));

// Fires on the element when state changes via put/patch/push/pull
app.addEventListener('data:sync', e => {
  if (e.detail.key === 'todos') recompute();
});
```

### Utility exports

```js
import { q, qcb, on, emit, VP_FORMATTERS, VP_TEMPLATES, CONFIG } from 'data-wrapper';

q('.item');                           // [...querySelectorAll('.item')]
qcb('.item', el => el.textContent);   // query + map
on('click', handler, '.btn');         // delegated listener, returns unsubscribe fn
emit('my:event', payload);            // CustomEvent dispatch
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
data-wrapper.ts (source)
├── utils.ts       — q, qcb, emit, on (DOM utilities)
├── types.ts       — UpdateConfig, Config, Formatter interfaces
├── registry.ts    — CONFIG, VP_FORMATTERS, VP_TEMPLATES, PROP_ALIASES, RENDER_DIRECTIVES, sync
├── engine.ts      — applyBinding, applyItemBindings, reconcile
├── wire.ts        — parsePath, wake, subscribe, WrapperNode interface, event delegation
└── component.ts   — DataWrapper class, customElements.define
```

**Wiring phase (O(N), once at mount):** `wake()` walks the subtree once, reads `$`/`_`/`@` attributes, and builds `subs` — a flat map of `{ stateKey → UpdateConfig[] }`.

**Reaction phase (O(1) per key):** When state changes, `_notify(key, val)` looks up `subs[key]` directly and writes to only the subscribed DOM nodes.

**Render directives** (`RENDER_DIRECTIVES`) intercept before DOM writes for structural operations. Currently: `list` (reconciler). Planned: `match`, `if`.

---

## Status

| Feature | Status |
|---------|--------|
| `$` bindings (text, props, attrs) | ✅ Working |
| `@` event delegation + `action:` | ✅ Working |
| `register()` action handlers | ✅ Working |
| `$list` reconciler | ✅ Working |
| `./` item-scoped paths in `$list` | ✅ Working |
| `?format=` query param pipes | ✅ Working |
| Cross-wrapper `//id/key` | 🚧 In progress |
| `_` additive class token | 🚧 In progress |
| `$match` render directive | 🚧 Planned |
| `$if` render directive | 🚧 Planned |
| `api://` remote fetch | 🚧 Planned |
