# data-wrapper

Zero-dependency, HTML-first reactivity built on a single Web Component.
Components are plain ES modules; views bind DOM effects to their live exports
through three tokens. No build step, no virtual DOM, no JSX.

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

Named exports are the component's state surface. Mutate `count` inside an
action; every binding that reads it updates on the next flush.

## Component Instances

Module exports are shared by every wrapper that imports the same component
module. A default export can act as a per-wrapper factory when a view needs
instance state or inputs from its mounting point:

```js
export const label = 'Counter';

export default ({ props }) => {
    let count = Number(props.start ?? 0);
    return {
        get count() { return count; },
        inc() { count += 1; },
    };
};
```

```html
<data-wrapper src="counter.html?start=5"></data-wrapper>
```

`src` query entries become factory `props`. A child wrapper resolves each entry
against the parent binding context where it is mounted; resolved entries are
stable function readers, and unresolved entries are static strings. Inputs are
not automatically added to the template binding namespace, so the factory
decides what to expose:

```html
<data-wrapper src="card.html?customer&status=orderStatus"></data-wrapper>
```

```js
export default ({ props }) => ({
    customer: props.customer,
    status: props.status,
});
```

Inside `card.html`, `$text="customer/firstName"` reads the exposed instance
binding. `props.url` is always the full `src` string.

## Docs

The full documentation is a set of views in this repo at `views/docs/`,
mounted by `framework.html` alongside the showcase components they describe.
Run the dev server and open `/framework.html` in a browser:

```sh
bun install
bun run serve
# then open http://localhost:3000/framework.html
```

The docs themselves use the same component-module pattern they document —
each section is a `<data-wrapper>` over a single view file, with showcase
components interleaved so each concept is followed by a live working example.

## Sections

| Section | View |
| --- | --- |
| Intro | `views/docs/intro.html` |
| Install | `views/docs/install.html` |
| Three tokens | `views/docs/tokens.html` |
| Module &amp; factory | `views/docs/factory.html` |
| Cross-module imports | `views/docs/modules.html` |
| Binding contexts | `views/docs/contexts.html` |
| Directives | `views/docs/directives.html` |
| Events | `views/docs/events.html` |
| Reactivity model | `views/docs/reactivity.html` |
| Formatters | `views/docs/formatters.html` |
| Known limitations | `views/docs/limitations.html` |

## Project layout

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
