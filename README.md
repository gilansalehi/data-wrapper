# data-wrapper

A zero-dependency, HTML-first reactivity engine built on native Web Components. No build step, no virtual DOM, no framework lock-in — just import and go.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"></script>
```

---

## Core Philosophy: The DOM Is the Truth

Most frameworks treat the DOM as a side effect of a JavaScript state machine. `data-wrapper` inverts this. The `<data-wrapper>` element's `data-*` attributes **are** the state store, and the component is intimately aware of changes from any direction.

- **JS → DOM**: Writing to `wrapper.state.theme = 'dark'` serialises the value and sets `data-theme="dark"` on the element.
- **DOM → JS**: A `MutationObserver` watches the element. If any script sets `el.dataset.theme = 'dark'` directly, the framework catches it and notifies all subscribers.
- **CSS targeting**: Because state lives on `data-*` attributes, you get native CSS selectors for free: `[data-theme="dark"] { ... }`.

---

## Declarative Tokens

Three attribute prefixes wire up the entire application — no JavaScript required in the template:

| Token | Name | Direction | Example |
|-------|------|-----------|---------|
| `$`   | Bind | State → DOM | `$text="username"` |
| `_`   | Additive class | State → className | `_class="status"` |
| `@`   | Event | DOM → State | `@click="todo:remove"` |

---

## DWRL — Data Wrapper Resource Locator

Binding expressions are pure URL-shaped addresses parsed by the browser's native `new URL()` engine. The intent (read vs. write) is determined by the DOM token (`$`, `_`, `@`), so the string itself needs no verb.

**Canonical structure:** `[scheme]://[authority].[storage]/[path] | [pipes]`

| Part | Description | Example |
|------|-------------|---------|
| `scheme` | `data://` (default), `action://`, `api://` | `data://` |
| `authority` | `id` of the target `<data-wrapper>` | `cart` |
| `storage` | `.data` (default), `.local`, `.session` | `.data` |
| `path` | Unix-style key path | `/ui/activeTab` |
| `pipes` | `\|`-separated formatter names | `\| upper \| trim` |

**Shorthand resolution:**
- `/draft` → `data://[current-wrapper].data/draft`
- `//cart.data/isOpen` → crosses to the `#cart` wrapper

---

## Reactivity Pipeline

### Phase A — Wiring (O(N), once at mount)

When a `<data-wrapper>` connects, `wakeTree` performs a **single pass** over its subtree. For each `$` and `_` attribute it finds, it builds an `UpdateConfig` object and registers it in `wrapper.subs[path]`.

`@` attributes are wired as event listeners on the wrapper element, delegated via the bubbling path.

### Phase B — Reaction (O(1), per update)

Once wired, the tree is never walked again. When `_notify(key, value)` is called:

1. It looks up `subs[key]` — a direct identity map hit.
2. It runs the resolved pipe functions over the value.
3. It writes the result to the exact DOM property or attribute.

Updates from `put` / `patch` / `push` / `pull` are synchronous; the `MutationObserver` path uses `queueMicrotask` to batch external DOM writes and avoid re-entrancy.

---

## State API

All methods live on the `<data-wrapper>` element instance.

```js
const app = document.getElementById('app'); // <data-wrapper id="app">

app.put('count', 1);                        // set
app.put('count', n => n + 1);              // updater function
app.patch('user', { name: 'Ali' });        // shallow merge
app.push('todos', { id: 1, text: 'Buy milk' }); // append
app.pull('todos', 1);                      // remove by id
app.pull('todos', t => t.done);            // remove by predicate

app.state.count;                           // read (parsed from dataset)
```

`state` is a Proxy over `dataset`. Reads auto-parse JSON; writes serialise objects to JSON and primitives to strings.

---

## List Rendering

Attach `$list="keyName"` to any container that has a `<template>` child. The reconciler diffs the current array against a `Map` cache keyed by `item.id`, performing only the minimum DOM mutations (append / reorder / remove).

```html
<ul $list="todos">
  <template>
    <li $text="task" $class="status" @click="todo:remove"></li>
  </template>
</ul>
```

An optional empty-state template is shown when the array is empty:

```html
<template id="my-empty"><li>Nothing here yet.</li></template>
<ul $list="todos" data-empty="my-empty"> ... </ul>
```

---

## Events

### Lifecycle

```js
document.addEventListener('data-wrapper:load', e => {
  console.log('wrapper ready', e.detail); // the DataWrapper element
});
```

### State sync

```js
app.addEventListener('data:sync', e => {
  console.log('key changed:', e.detail.key);
});
```

### Custom events via `@`

`@submit="form:submit"` causes the wrapper to dispatch a `form:submit` CustomEvent when a `submit` fires inside it. Listen anywhere:

```js
app.addEventListener('form:submit', e => { ... });
// or shorthand:
app.on('form:submit', handler);
```

---

## Utility API

These utilities are exported from the package and also available as methods on any `DataWrapper` instance (with the element as the default context):

```js
import { q, qcb, on, emit } from 'data-wrapper';

q('.item');                         // [...document.querySelectorAll('.item')]
qcb('.item', el => el.textContent); // query + map
on('click', handler, '.btn');       // delegated listener, returns unsubscribe
emit('my:event', payload);          // CustomEvent dispatch
```

---

## Built-in Pipes

Pipes are applied with `|` in binding expressions: `$text="price | currency"`.

| Pipe | Effect |
|------|--------|
| `count` | Array or string length |
| `fallback` | `value ?? '—'` |
| `json` | `JSON.stringify` (pretty) |
| `upper` / `lower` | Case conversion |
| `currency` | `Intl.NumberFormat` USD |
| `date` | `toLocaleDateString()` |
| `trim` | Whitespace trim |
| `bool` | `!!value` |

Register custom pipes before the wrapper mounts:

```js
import { VP_FORMATTERS } from 'data-wrapper';
VP_FORMATTERS.set('reverse', v => String(v).split('').reverse().join(''));
```

---

## Configuration

Set `window.VP_CUSTOM_CONFIG` before the script loads to override defaults:

```html
<script>
  window.VP_CUSTOM_CONFIG = {
    TOKENS: { BIND: ':', ADD: '+', EVT: '#' }
  };
</script>
<script src="/dist/data-wrapper.js" type="module"></script>
```

---

## Quick Example

```html
<data-wrapper id="app" data-count="0">
  <p>Count: <strong $text="count">0</strong></p>
  <button @click="count:increment">+1</button>
</data-wrapper>

<script type="module" src="/dist/data-wrapper.js"></script>
<script>
  customElements.whenDefined('data-wrapper').then(() => {
    const app = document.getElementById('app');
    app.on('count:increment', () => app.put('count', n => Number(n) + 1));
  });
</script>
```
