# data-wrapper

data-wrapper is a zero-dependency, HTML-first reactivity library built around
one Web Component. A component view is an HTML file with an optional module
script. The view binds DOM effects to live module exports with three tokens:
`$` for DOM properties, `*` for directives, and `@` for events.

There is no build step, virtual DOM, JSX, or component compiler.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"></script>
<data-wrapper src="counter.html"></data-wrapper>
```

```html
<!-- counter.html -->
<script type="module" data-module="@view/counter">
    export let count = 0;
    export const doubled = () => count * 2;
    export function inc(event) {
        count += Number(event.target.value);
    }
</script>

<button @click="inc?prevent" value="1">+1</button>
<output $text="count"></output>
<output $text="doubled"></output>
```

Named exports are the view's shared state surface. A binding such as
`$text="count"` reads the current value of the exported binding and updates when
the component runtime flushes. Functions used as values are called before the
DOM is updated, so `doubled` can derive from `count` without creating a separate
state container.

If a component module imports public APIs such as `action`, `flush`, or
`DW_FORMATTERS` from `data-wrapper`, add an import map in the host page before
the framework script:

```html
<script type="importmap">
{
    "imports": {
        "data-wrapper": "https://unpkg.com/data-wrapper/dist/data-wrapper.js"
    }
}
</script>
```

## Three Tokens

The template syntax is intentionally small:

| Token | Example | Meaning |
| --- | --- | --- |
| `$` | `$text="label"` | Read a binding and write it to a DOM property or attribute. |
| `*` | `*list="items"` | Read a binding and drive a structural directive. |
| `@` | `@click="save"` | Listen for an event and invoke a component action. |

The built-in directives are `*list` and `*if`. A `*list` directive creates a row
binding context for each item, and `*if` inserts or removes a template body based
on the truthiness of the bound value.

## Reactivity

data-wrapper does not track individual property reads. Instead, each component
runtime re-reads the bindings that are currently connected to the DOM whenever a
flush runs. That makes the model explicit: mutate state inside an `action()`
wrapper, or call `flush()` manually after a mutation that happens outside an
action.

```js
import { action, flush } from 'data-wrapper';

export let todos = [];

export const addTodo = action(task => {
    todos = [...todos, { id: Date.now(), task, done: false }];
});

setTimeout(() => {
    todos = todos.filter(todo => !todo.done);
    flush();
}, 1000);
```

`action(fn)` returns a wrapped function that schedules a flush after the call
returns. If the wrapped function returns a Promise, another flush runs after the
Promise settles. `action({ add, remove })` wraps each function in an object, and
`action(action(fn))` returns the already wrapped function.

Flushes are global across active component runtimes. If one component imports an
action-wrapped writer from another module, calling that writer will update every
mounted component that reads the affected exports.

## Events

An `@event` binding dispatches through the component runtime. When the binding
name matches an exported function, that function is invoked with the browser
event.

```html
<form @submit="save?prevent">
    <button>Save</button>
</form>
```

The supported event modifiers are query params:

| Modifier | Effect |
| --- | --- |
| `?prevent` | Calls `event.preventDefault()`. |
| `?stop` | Calls `event.stopPropagation()`. |
| `?immediate` | Calls `event.stopImmediatePropagation()`. |

Inside a `*list` row, the event detail includes the nearest row item at
`event.detail.item`. That is useful for actions such as remove, toggle, or edit:

```js
export const removeTodo = action(event => {
    const item = event.detail.item;
    todos = todos.filter(todo => todo.id !== item.id);
});
```

## Module Scope and Instances

Named exports live at module scope. If the same component module is mounted more
than once, those named exports are shared by every wrapper that imports the
module. That is the right default for shared application state such as theme,
auth, or a central collection.

```html
<!-- theme.html -->
<script type="module" data-module="@view/theme">
    import { action } from 'data-wrapper';

    export let theme = 'light';
    export const toggleTheme = action(() => {
        theme = theme === 'light' ? 'dark' : 'light';
    });
</script>

<button @click="toggleTheme">Toggle</button>
<output $text="theme"></output>
```

When a view needs per-wrapper state, export a default factory. The factory runs
once for each mounted wrapper and can return an object of instance bindings.
Instance bindings shadow named module exports with the same name.

```html
<!-- counter.html -->
<script type="module" data-module="@view/counter">
    import { action } from 'data-wrapper';

    export const label = 'Counter';

    export default ({ props }) => {
        let count = Number(props.start ?? 0);
        return {
            get count() { return count; },
            inc: action(() => { count += 1; }),
        };
    };
</script>

<h2 $text="label"></h2>
<button @click="inc">+1</button>
<output $text="count"></output>
```

```html
<data-wrapper src="counter.html?start=5"></data-wrapper>
<data-wrapper src="counter.html?start=20"></data-wrapper>
```

Each wrapper gets its own `count`, while `label` remains shared module state.

## Child Inputs

`src` query entries become factory `props`. A child wrapper resolves each entry
against the binding context where the child is mounted, then passes the resolved
values to the child's default factory.

```html
<data-wrapper src="card.html?customer&status=orderStatus"></data-wrapper>
```

The example above is equivalent to:

```html
<data-wrapper src="card.html?customer=customer&status=orderStatus"></data-wrapper>
```

If an input resolves to a parent binding, the prop is a stable function reader.
If no binding resolves, the prop is a static string. Inputs are not automatically
added to the child's template binding namespace; the factory decides what to
expose.

```js
export default ({ props }) => ({
    customer: props.customer,
    status: props.status,
});
```

Inside `card.html`, `$text="customer/firstName"` reads the exposed instance
binding. `props.url` is reserved and always contains the full original `src`
string.

Two reserved cases behave differently from ordinary unresolved strings:
protocol-prefixed inputs such as `localStorage://key` are omitted, and missing
cross-wrapper inputs such as `//cart/total` warn and are omitted.

## Binding Contexts

Bindings resolve lexically from the DOM location where they wake.

| Form | Meaning |
| --- | --- |
| `name` | Reads the nearest row that owns `name`, then outer rows, then the component instance or module. |
| `./name` | Reads the nearest row only. |
| `../name` | Reads the parent row only. Repeat as `../../name` for higher rows. |
| `/name` | Reads the component root scope and bypasses rows. |
| `//id/name` | Reads another loaded `<data-wrapper id="id">`, component root scope only. |

Protocol-prefixed forms such as `localStorage://key` are reserved for future
resolvers. They are inert today: no static fallback, no event dispatch, and no
child input value.

## Cross-Module Imports

`data-module` marks the component module in a view and gives it a stable import
name. Other component modules can import from that name just like they import
from any ES module.

```html
<!-- nav.html -->
<script type="module" data-module="@view/nav">
    import { action } from 'data-wrapper';

    export let open = false;
    export const toggle = action(() => { open = !open; });
</script>
```

```html
<!-- dashboard.html -->
<script type="module" data-module="@view/dashboard">
    import { open, toggle } from '@view/nav';

    export const navLabel = () => open ? 'Navigation open' : 'Navigation closed';
    export { toggle };
</script>

<button @click="toggle">Toggle nav</button>
<p $text="navLabel"></p>
```

This is the preferred channel for shared application state. ES module live
bindings preserve the connection between producer and consumer, and
`action()`/`flush()` keep every mounted runtime up to date.

## Formatters

Formatter params run left-to-right on `$` bindings and `*` directive sources.
Formatter arguments are static strings.

```html
<span $text="name?trim&case=title"></span>
<span $text="price?currency=EUR"></span>
<template *list="orders?unique=id&sort=-createdAt"></template>
```

Built-ins: `default`, `bool`, `case`, `trim`, `truncate`, `count`, `join`,
`sort`, `unique`, `number`, `fixed`, `percent`, `currency`, `date`, `time`,
`datetime`, and `json`.

If formatter configuration needs to be reactive, use a computed export instead
of a formatter argument:

```js
export const sortedOrders = () => {
    return [...orders].sort((a, b) => a[sortKey].localeCompare(b[sortKey]));
};
```

## Cross-Wrapper Reads

Use ES module imports for shared application state, child inputs for
parent-to-child configuration, and DOM events for child-to-parent or outward
signals.

`//id/name` is the explicit cross-wrapper read escape hatch. It reads from the
component scope of the loaded wrapper with that DOM id.

```html
<data-wrapper id="orders" src="orders.html"></data-wrapper>
<data-wrapper src="orders-monitor.html"></data-wrapper>
```

```html
<!-- orders-monitor.html -->
<output $text="//orders/orderCount"></output>
```

Cross-wrapper reads do not inspect row scopes, dispatch actions, wait for
wrappers that load later, or retry after reload. A missing target or path warns
and leaves the binding untouched.

## Browser Support

data-wrapper runs on modern evergreen browsers with native ES modules, custom
elements, and import maps. The loader registers component modules through import
maps at runtime, and component code uses normal `import` syntax throughout.

For browsers without runtime import-map support, point the framework `<script>`
at [es-module-shims](https://github.com/guybedford/es-module-shims) with a
`data-shim-src` attribute. The shim loads only if native module resolution
actually fails, so native-capable browsers never download it.

```html
<script src="https://unpkg.com/data-wrapper/dist/data-wrapper.min.js"
        data-shim-src="https://ga.jspm.io/npm:es-module-shims@2/dist/es-module-shims.js"></script>
```

A CDN URL is the simplest option; vendoring a copy and pointing
`data-shim-src` at it works identically. If a module fails to resolve and no
shim is configured, the loader throws a clear error telling you to add one.

## Known Limitations

The framework is still pre-1.0, and a few boundaries are intentional:

Cross-wrapper reads are read-only and load-order sensitive. Use module imports
for shared state when both components should participate in the same reactive
model.

View-module imports depend on registration order. A consumer can import from a
`data-module` name only after the producer view has been loaded and registered.
Use plain JavaScript modules plus a host import map for shared state that must be
available during first import.

Protocol-prefixed binding values such as `localStorage://key` are reserved for
future source resolvers. They are inert today.

Custom directives cannot create new row scopes yet. They can decorate DOM, wake
DOM under the context they receive, and register cleanup. Scope-introducing
behavior remains built into `*list`.

There is no lifecycle hook matrix beyond the default factory and
`context.cleanup()`.

There is no SSR or hydration path. data-wrapper is client-rendered.

## Docs

The full documentation is a set of views in this repo at `views/docs/`, mounted
by `framework.html` alongside the showcase components they describe. Run the dev
server and open `/framework.html` in a browser:

```sh
bun install
bun run serve
# then open http://localhost:3000/framework.html
```

The docs use the same component-module pattern they document. Each section is a
`<data-wrapper>` over a single view file, with showcase components interleaved
so each concept is followed by a live example.

## Sections

| Section | View |
| --- | --- |
| Intro | `views/docs/intro.html` |
| Install | `views/docs/install.html` |
| Three tokens | `views/docs/tokens.html` |
| Module & factory | `views/docs/factory.html` |
| Cross-module imports | `views/docs/modules.html` |
| Binding contexts | `views/docs/contexts.html` |
| Directives | `views/docs/directives.html` |
| Events | `views/docs/events.html` |
| Reactivity model | `views/docs/reactivity.html` |
| Error handling | `views/docs/errors.html` |
| Formatters | `views/docs/formatters.html` |
| Known limitations | `views/docs/limitations.html` |

## Project Layout

```
src/lib/
    utils.ts       binding parser, readPath, DOM helpers
    engine.ts      binding contexts, wake/wire/bind, reconcile, *list/*if
    component.ts   ComponentRuntime, action(), flush()
    element.ts     <data-wrapper> custom element + load()
    index.ts       re-exports
```

## License

MIT
