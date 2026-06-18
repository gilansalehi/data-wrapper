# State in data-wrapper

State lives in component modules. Each loaded view can carry one
`<script type="module" data-component data-module="...">` block; its
`export let` declarations are reactive cells, its exported functions either
run as event handlers or mutate state when called from elsewhere.

There are exactly two reactivity primitives: **`action()`** (a function
wrapper) and **`flush()`** (a manual flush trigger). That's it.

## Component module state

A view is a single HTML file: markup plus an inline `<script type="module"
data-component>`. Named exports are directly available to its template.

```html
<!-- counter.html -->
<script type="module" data-component data-module="@view/counter">
    export let count = 0;
    export const doubled = () => count * 2;
    export function inc(e) { count += Number(e.target.value); }
</script>

<button @click="inc?prevent" value="1">+1</button>
<output $text="count"></output>
<output $text="doubled"></output>
```

You don't import `action()` here. The framework wraps `@event`-bound handlers
in an action boundary automatically — when `inc` runs, every binding that
reads `count` (directly or through `doubled`) re-derives and updates.

If you'd rather keep the markup and JS in separate files, point at an external
module via
`<script type="module" data-component data-module="@view/counter" src="./counter.js">`.

## Per-mount instance state

The default export is an optional factory. It runs once per mounted wrapper
and returns an instance binding scope:

```html
<script type="module" data-component data-module="@view/instance-counter">
    export const title = 'Counter';

    export default () => {
        let count = 0;
        return {
            get count() { return count; },
            doubled: () => count * 2,
            inc() { count += 1; },
        };
    };
</script>
```

Bindings check the instance first and named exports second. This keeps module
exports available while allowing repeated mounts, list-owned views, or other
consumers to carry independent closure state. The default factory does not
need to repeat named exports in its return value.

## Shared state across components

State that more than one component reads or writes lives in a plain ES module.
Mark the exported mutators with `action()` so calls from anywhere — another
component, a timer, a fetch handler — trigger a flush:

```js
// /state/todos.js
import { action } from 'data-wrapper';

export let todos  = [];
export let filter = 'all';

export const { addTodo, removeTodo, setFilter } = action({
    addTodo:    item => { todos = [...todos, item]; },
    removeTodo: id   => { todos = todos.filter(t => t.id !== id); },
    setFilter:  f    => { filter = f; },
});
```

Consuming components import what they need:

```html
<!-- /views/todo-list.html -->
<script type="module" data-component data-module="@view/todo-list">
    import { todos, filter } from '/state/todos.js';
    export const view = () => todos.filter(t =>
        filter === 'all' ? true : filter === 'done' ? t.done : !t.done
    );
</script>

<ul>
    <template *list="view">
        <li $text="./task"></li>
    </template>
</ul>
```

```html
<!-- /views/todo-form.html -->
<script type="module" data-component data-module="@view/todo-form">
    import { addTodo } from '/state/todos.js';
    export function submit(e) {
        addTodo({ id: Date.now(), task: e.target.task.value, done: false });
    }
</script>

<form @submit="submit?prevent">
    <input name="task" required>
    <button>Add</button>
</form>
```

When `submit` calls `addTodo`, the action wrapper schedules a flush across
every active runtime. The list re-derives `view`, reconciles the new row, and
renders. ESM live bindings ensure both modules see the latest `todos` value
without any synchronization code.

An imported name is private to the importing module unless it is exported
again. To expose shared state directly to a template, re-export it:

```js
export { todos, addTodo } from '/state/todos.js';
```

## `action()` accepts a function or an object

```js
// Single function
export const setFilter = action(f => { filter = f; });

// Object — wraps each value, returns the same shape
export const { addTodo, removeTodo } = action({
    addTodo:    item => { todos = [...todos, item]; },
    removeTodo: id   => { todos = todos.filter(t => t.id !== id); },
});
```

The object form is convenient for grouping a state module's full API. Each
key becomes an independently importable export.

## Async actions

`action()` automatically chains a flush onto returned Promises. The
loading→data pattern works without ceremony:

```js
export const loadItems = action(async () => {
    state.loading = true;
    state.items   = await fetch('/items').then(r => r.json());
    state.loading = false;
});
```

The synchronous portion (`state.loading = true`) publishes after the function
returns its Promise; the post-await portion publishes when the Promise
resolves. Bindings see the loading state immediately, then the data.

**Intermediate awaits** need a manual `flush()` if you want their state
visible between steps:

```js
import { action, flush } from 'data-wrapper';

export const wizard = action(async () => {
    state.step = 1;
    await fetchA();
    state.step = 2;
    flush();              // otherwise step 2 isn't published until fetchB resolves
    await fetchB();
    state.step = 3;
});
```

## Manual `flush()`

For mutations that can't be wrapped — a third-party event listener, a setter
called from non-action JS — use `flush()`:

```js
import { flush } from 'data-wrapper';

window.addEventListener('storage', (e) => {
    user = JSON.parse(e.newValue);
    flush();
});
```

`flush()` synchronously re-derives every active runtime's outputs. `Object.is`
short-circuits unchanged values, so calling it speculatively is cheap.

## Idempotence

- **`action(action(fn)) === action(fn)`** — double-wrap is a no-op. Safe to
  let the framework wrap an already-wrapped export.
- **Nested actions don't double-flush.** Multiple action calls within the same
  microtask coalesce into one flush via microtask scheduling, so calling
  `addTodo` from inside `loadItems` doesn't cost more than one re-derive.

## The mental model in one sentence

*Reactivity boundaries are explicit functions; the framework auto-wraps them
for `@event` handlers and gives you `action()` for everything else.*
