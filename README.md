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

## Docs

The full documentation is a set of views in this repo at `views/docs/`,
mounted by `docs.html`. Run the dev server and open `/docs.html` in a
browser:

```sh
bun install
bun run serve
# then open http://localhost:3000/docs.html
```

The docs themselves use the same component-module pattern they document —
each section is a `<data-wrapper>` over a single view file.

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
