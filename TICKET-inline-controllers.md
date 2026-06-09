# Ticket: First-class component scripts via `<script type="dw/controller">`

## Summary

Treat `<script type="dw/controller">` as the canonical, zero-config
mechanism for framework-owned init code inside any `<data-wrapper>` —
whether the wrapper is inline in the initial page or loaded via `src`.
Controller scripts get a wrapper-scoped context, run after `wake()`, and
are removed from the rendered DOM after execution. The existing
`?run-scripts` URL opt-in stays as the **file-level escape hatch** for
running *all* inline `<script>` tags (the current legacy semantic).

The bigger picture: this completes a Svelte-like single-file component
pattern. An author writes one HTML file with co-located `<style>`,
`<script type="dw/controller">`, and markup; the framework handles all
three the same way whether the file is the initial page, an inline
fragment, or a `src`-loaded view. `@scope` covers the CSS side; this
ticket covers the JS side.

## Current state

`DataWrapper.load()` (in `src/lib/component.ts`) already handles inline
scripts in `src`-loaded HTML via a URL opt-in: append `?run-scripts` to
the `src`, and `load()` re-creates each inline `<script>` tag (excluding
`<script src>` and scripts inside descendant wrappers). The browser
then executes them before `wake()` binds the rest of the markup.

The flagship demo uses this:

```html
<data-wrapper id="app" data-filter="all"
              $data-todos="localstorage://todos"
              src="views/showcase/todos.html?run-scripts">
</data-wrapper>
```

Inside `todos.html`, scripts find their wrapper through
`document.currentScript.closest('data-wrapper')` and then call
`app.register(...)`.

For **inline** wrappers (where the markup is in the initial page, not
loaded via `src`), the browser executes inline `<script>` tags on parse —
no framework involvement. Authors typically write:

```html
<data-wrapper id="activate">
  <button @click="handleClick">Activate</button>
  <script>
    const [wrapper] = q('#activate');
    customElements.whenDefined('data-wrapper').then(() => {
      wrapper.register({ handleClick: () => wrapper.put('clicked', true) });
    });
  </script>
</data-wrapper>
```

Both paths work. Both also share the same friction:

- **Boilerplate to find the wrapper.** Every script starts with the
  same `q()` / `closest()` / `getElementById()` dance, then binds
  methods or saves the handle.
- **Inline scripts persist in the rendered DOM** after execution.
- **`?run-scripts` is a URL workaround** for the loaded case. For
  inline wrappers there's no equivalent — authors have to time their
  registrations around `customElements.whenDefined` to be safe.
- **No single-file-component story.** The Svelte-like co-location works
  in practice (the user's sketch is proof) but isn't a framework
  affordance, just a side-effect of the pieces.

The `register()` / `put()` / `patch()` / `push()` / `pull()` /
`handlePut()` wrapper surface, the `q` / `on` / `emit` helpers in
`src/lib/utils.ts`, the `put:` write protocol on `@`-tokens, the
two-wake sequence for `src=""` loads, and `unwake()` teardown are all
already in place. This ticket layers on top of them.

## Motivation

The loader plus the wrapper plus a few inline patterns adds up to a
component model — the user can write a single HTML file that's a
self-contained widget. Recognizing that pattern as **the** authoring
unit, and giving its scripts a real seat at the table, leans into the
browser-as-framework philosophy. Not "no JS" — that was always
overselling — but "JS, but the good parts": tiny init blocks that
co-locate with the markup they wire up, run automatically, and don't
require boilerplate to find their wrapper.

`@scope` (`@scope (.todo-item) { ... }`) gives the same story for CSS.
With both pieces, a loaded view file is structurally identical to a
Svelte single-file component:

```html
<style>
  @scope {
    button { background: tomato; }
  }
</style>

<button @click="activate?prevent">Activate</button>
<p $text="/status"></p>

<script type="dw/controller">
  put('status', 'idle');
  register({
    activate: () => put('status', 'active')
  });
</script>
```

No imports, no manual wrapper lookup, no `?run-scripts`, no global
namespace pollution. The framework runs the script; the browser scopes
the CSS; the markup uses the framework's existing tokens.

Many simple cases will skip controllers entirely — the `put:` protocol
on `@`-tokens already handles direct state writes declaratively:

```html
<button @click="put:/status" name="status" value="active">Activate</button>
```

Controllers are for cases that need transformation, validation, async
flow, or multi-step cascades — the 10% case described in the `put:`
section of FRAMEWORK.md.

## Goals

- `<script type="dw/controller">` runs by default in any wrapper, with
  no opt-in required — neither URL flag nor markup configuration.
- Same mechanism works in inline page HTML and `src`-loaded views.
- Controller code receives a wrapper-scoped context (no manual lookup).
- Controllers execute **once per wake** in document order, after the
  wake binds the surrounding markup.
- Controller scripts are removed from the rendered DOM after execution.
- Ordinary `<script>` tags inside loaded HTML stay inert by default;
  `?run-scripts` remains the opt-in for running them. Both opt-ins
  coexist independently.
- Existing `.js`/`.mjs` controller path (dynamic import,
  `default(wrapper)`) is unchanged.
- Existing `onload=""` path for tiny one-liners is unchanged.
- `?run-scripts` behavior for current consumers (todos demo) is
  unchanged.

## Non-goals

- Do not execute arbitrary `<script>` tags inserted through loaded
  HTML (still gated behind `?run-scripts`).
- Do not add a template compiler.
- Do not add inline expression parsing.
- Do not support `import` / `export` inside `type="dw/controller"`
  scripts (authors who need modules use a `.js`/`.mjs` controller).
- Do not solve remote trust/sandboxing beyond requiring explicit
  `dw/controller` opt-in by markup.
- Do not implement CSS `@scope` semantics or polyfill them. The
  browser handles `@scope`; this ticket just notes the co-location
  pattern that emerges when both pieces are in place.
- Do not invent a separate file extension. A "single-file component"
  is just an `.html` file with conventions.

## Proposed authoring API

Inside any `<data-wrapper>` (inline or `src`-loaded), a
`<script type="dw/controller">` block runs once per wake with these
local bindings:

```js
wrapper   // the current <data-wrapper> element
root      // alias for wrapper
state     // wrapper.state (Proxy)
get       // wrapper.get.bind(wrapper)
put       // wrapper.put.bind(wrapper)
patch     // wrapper.patch.bind(wrapper)
push      // wrapper.push.bind(wrapper)
pull      // wrapper.pull.bind(wrapper)
register  // wrapper.register.bind(wrapper)
q         // scoped query helper: q(selector, ctx = wrapper)
on        // event helper from src/lib/utils.ts
emit      // event helper from src/lib/utils.ts
```

All wrapper methods exist on the current `DataWrapper` class
(`src/lib/component.ts`); `q`, `on`, `emit` are already exported from
`src/lib/utils.ts`. `q`'s shipped signature is
`(s, ctx: DWContext = document) => Element[]`; the controller context
binds the default `ctx` to the wrapper.

`handlePut` is intentionally **not** exposed — it's the framework's
default `put:` event handler, not part of the authoring surface. Users
who want to layer additional behavior on `put:` events use
`register({'put:': cb})`.

## Where `dw/controller` runs

### Inline wrappers (initial page HTML)

Browsers don't execute `<script type="dw/controller">` because the
type isn't recognized — the script sits in the DOM as inert text. The
framework finds and runs it during `connectedCallback`:

1. Collect controller scripts whose closest `<data-wrapper>` is `this`.
2. Remove the collected scripts from the DOM.
3. Continue normal connect: observer, listeners, `wake(this)`.
4. After `wake()` and the `dw/load`/`load` dispatches, execute
   controllers in document order.

Authors don't need `customElements.whenDefined`, don't need
`closest()`, and don't need to worry about timing — the framework
owns the execution window.

### `src`-loaded wrappers

After fetch, before insertion:

1. Parse HTML into a fragment.
2. Collect controller scripts whose closest `<data-wrapper>` ancestor
   in the fragment is `null` (i.e. owned by this wrapper, not a
   nested one).
3. Remove the collected scripts from the fragment.
4. `unwake(this)`, swap content, reset state (same as today).
5. If `?run-scripts` is set, run the existing `runScripts()` pass over
   the controller-stripped subtree.
6. `wake(this, null, this)`.
7. Execute collected controllers in document order.
8. Emit `dw/loaded`.

### Nested wrappers

Controllers inside a descendant `<data-wrapper>` are **not** executed
by the outer wrapper's wake — they run when that nested wrapper itself
connects (or loads). Each wrapper owns the controllers in its own
content tree.

## Controller execution model

```ts
const runController = async (code: string, ctx: Record<string, unknown>) => {
    const keys = Object.keys(ctx);
    const vals = Object.values(ctx);
    const fn   = new Function(...keys, `'use strict';\n${code}`);
    return await fn(...vals);
};

// Called from connectedCallback and from load()'s HTML branch:
for (const script of collectedControllers) {
    await runController(script.textContent ?? '', createControllerContext(this));
}
```

Controllers execute **sequentially**, in document order. Each gets its
own lexical scope; shared state is via the wrapper.

If a controller throws, the wake/load chain rejects. For MVP the throw
propagates; a follow-up may add a `dw/error` event for richer error
surfacing.

`new Function()` shows up as `VM###` in DevTools by default. Append a
`//# sourceURL=…` comment derived from the wrapper id + script index
inside `runController` for clearer stack traces.

## Multiple controllers

Allowed. They execute in DOM order and share wrapper state but not
lexical scope:

```html
<script type="dw/controller">
  put('status', 'idle');
</script>

<script type="dw/controller">
  register({ activate: () => put('status', 'active') });
</script>
```

## Security posture

Only `<script type="dw/controller">` runs without opt-in. Plain
`<script>`, `<script type="module">`, and `<script src="…">` stay
inert under normal HTML insertion semantics; `?run-scripts` is the only
way to make them execute, and only for `src`-loaded HTML.

Two explicit, distinct opt-ins:

- **`dw/controller`** — framework-owned, scoped, runs by default.
- **`?run-scripts`** — author asserts "execute every inline script in
  this file like a normal page would," used today by `todos.html`.

Both stay explicit. Neither runs unknown code by accident.

## Single-file component pattern

This isn't a ticket deliverable — it's the shape that emerges once
`dw/controller` runs by default. Worth naming because it sets the
direction:

```html
<!-- views/showcase/activate-account.html -->
<style>
  @scope {
    :scope { display: block; padding: 1rem; }
    button { background: tomato; }
  }
</style>

<button @click="activate?prevent">Activate</button>
<p $text="/status"></p>

<script type="dw/controller">
  put('status', 'idle');
  register({
    activate: () => put('status', 'active')
  });
</script>
```

Used as either:

```html
<!-- inline -->
<data-wrapper id="activate">
  <!-- (same content as above) -->
</data-wrapper>

<!-- or loaded -->
<data-wrapper src="/views/showcase/activate-account.html"></data-wrapper>
```

Both render identically. Same scoping for CSS (via `@scope`), same
scoping for state (via the wrapper), same controller execution.
Co-location without a build step.

## Example target behavior

Given:

```html
<data-wrapper id="activate" src="/activate.html"></data-wrapper>
```

And `/activate.html`:

```html
<button @click="activate?prevent">Activate</button>
<p $text="/status"></p>

<script type="dw/controller">
  put('status', 'idle');
  register({
    activate: () => put('status', 'active')
  });
</script>
```

After load:

- Button is wired by `@click`.
- Paragraph is bound to `/status`.
- The wrapper wakes; `$text` fires with `undefined` → empty string.
- The controller runs; `put('status', 'idle')` updates the paragraph
  to "idle".
- The controller script is removed from the DOM.
- Clicking the button dispatches `activate`; the registered handler
  calls `put('status', 'active')`; the paragraph updates.

Same content as an **inline** wrapper:

```html
<data-wrapper id="activate">
  <button @click="activate?prevent">Activate</button>
  <p $text="/status"></p>
  <script type="dw/controller">
    put('status', 'idle');
    register({ activate: () => put('status', 'active') });
  </script>
</data-wrapper>
```

Behaves identically. The framework handles the controller at
`connectedCallback` time instead of at `load()` time, but the user-
visible result is the same.

## Implementation notes

Two entry points, one helper. Pseudocode:

```ts
// Inside the DataWrapper class.

private collectControllers(root: Element | DocumentFragment): HTMLScriptElement[] {
    const all = [...root.querySelectorAll('script[type="dw/controller"]')];
    // Owned by this wrapper, not a descendant wrapper.
    // For inline (root === this): closest must be `this`.
    // For fragment (root instanceof DocumentFragment): closest must be `null`
    // (no data-wrapper ancestors inside the fragment).
    const filter = root === this
        ? (s: Element) => s.closest('data-wrapper') === this
        : (s: Element) => s.closest('data-wrapper') === null;
    return all.filter(filter) as HTMLScriptElement[];
}

private async runControllers(scripts: HTMLScriptElement[]) {
    const ctx = createControllerContext(this);
    for (const [i, s] of scripts.entries()) {
        const src = `//# sourceURL=dw:${this.id || 'anon'}:${i}`;
        await runController(`${s.textContent ?? ''}\n${src}`, ctx);
    }
}
```

### `connectedCallback`

```ts
connectedCallback() {
    this._observer.observe(this, { attributes: true, attributeOldValue: true });
    on('dw/log', console.log, '', this);
    on('put:', (e) => { /* … */ }, '', this);

    const controllers = this.collectControllers(this);
    controllers.forEach(s => s.remove());

    wake(this);
    emit('dw/load', undefined, this);
    this.dispatchEvent(new Event('load'));

    this.runControllers(controllers);   // intentionally not awaited here

    if (this.hasAttribute('src')) queueMicrotask(() => this.load());
}
```

### `load()` (HTML branch)

```ts
const res = await fetch(url);
if (!res.ok) throw new Error(`load ${url.href}: ${res.status}`);

const html = await res.text();
const tpl  = document.createElement('template');
tpl.innerHTML = html;

const controllers = this.collectControllers(tpl.content);
controllers.forEach(s => s.remove());

unwake(this);
this.innerHTML = '';
this.append(tpl.content);
this._subs      = {};
this._unsubs    = [];
this._listCache = new Map();
this.removeAttribute('_live');

if (url.searchParams.has('run-scripts')) runScripts(this);
wake(this, null, this);

await this.runControllers(controllers);

emit('dw/loaded', { src: url.href }, this);
```

### Open implementation question: awaiting in `connectedCallback`

`connectedCallback` can't return a Promise the browser will await. The
above sketch fires-and-forgets controller execution at connect time so
the lifecycle isn't blocked. The `load()` path **does** await because
its return value gates `dw/loaded`. This means an inline wrapper's
`dw/load` fires before its controllers finish, while a loaded wrapper's
`dw/loaded` fires only after. We could add a separate `dw/ready` event
emitted after controllers complete in both paths — flag for design
review.

## Documentation updates

Rewrite the **View Loading** section of `FRAMEWORK.md` to cover
controllers as a first-class affordance, alongside the existing
`?run-scripts` escape hatch. Document:

- `<script type="dw/controller">` runs by default in any wrapper.
- Controller context (`put`, `register`, `q`, etc.).
- Behavior in inline vs `src`-loaded wrappers (same model, two entry
  points).
- `?run-scripts` remains the URL opt-in for running *all* inline
  scripts in a loaded view — the legacy path.
- The single-file component pattern (style + script + markup,
  optionally `@scope`-d).
- Choosing among `onload=""` / `.js`/`.mjs` controller /
  `<script type="dw/controller">` / `?run-scripts`.

Add showcase examples that demonstrate the pattern: probably a small
`views/showcase/component.html` that uses all three pieces in one file.

## Acceptance criteria

- `<script type="dw/controller">` runs once per wake in any wrapper —
  whether the wrapper is inline or `src`-loaded — without any
  configuration.
- Controllers run after `wake()`; immediate `put()` calls update bound
  DOM.
- Controller code can call `register`, `put`, `patch`, `push`, `pull`,
  `get`, and use `q`/`on`/`emit` without referencing the wrapper.
- Controllers are removed from the rendered DOM after execution.
- Multiple controllers run in DOM order.
- Controllers inside a nested `<data-wrapper>` do NOT execute in the
  outer wrapper's lifecycle — they run when that nested wrapper
  connects or loads.
- Ordinary `<script>` tags inside loaded HTML do not execute unless the
  URL carries `?run-scripts`.
- Existing `?run-scripts` behavior is unchanged — todos demo continues
  to function with its inline classic-`<script>` block.
- Existing `.js`/`.mjs` `src` behavior is unchanged.
- `$`, `*`, `@` bindings inside loaded HTML still work.
- `dw/loaded` fires after `await`ed controller execution completes for
  `src`-loaded wrappers.
- (Pending design call) An emitted `dw/ready` event marks
  controller-completion for inline wrappers if we want symmetry.

## Open questions

1. **Should `connectedCallback` await controllers?**
   It can't (`connectedCallback` is sync from the browser's POV). The
   sketch above fires-and-forgets at connect time. The `load()` path
   awaits because its caller already awaits. Options:
   - (a) Accept the asymmetry; document it.
   - (b) Add `dw/ready` event in both paths, emitted after controllers
     finish.
   - **Proposed: (b)**, because it gives downstream code a single event
     to wait on regardless of how the wrapper got its content.

2. **Should controllers see a different context if the wrapper has no
   id?** `//# sourceURL=dw:anon:N` is the fallback. Workable; no
   action.

3. **Async controllers — fail fast or sequential?**
   Sketch runs sequentially with `await`. If one throws, subsequent
   controllers don't run. Fine for MVP.

4. **`'use strict'`** prepended in `runController` — proposed yes,
   matches modern JS expectations.

5. **`get()` in the context** — yes, it exists on the wrapper today.

6. **Inline `import`?** Out of scope. Authors with imports use
   `.js`/`.mjs` controllers.

7. **Fragment-time nested-wrapper detection.** The implementation
   filters by `closest('data-wrapper')` against the fragment. Custom
   elements don't upgrade inside `<template>.content`, but `closest`
   matches by tag name, so the filter works regardless. Test path: a
   loaded view containing
   `<data-wrapper><script type="dw/controller">…</script></data-wrapper>` —
   the inner controller should not run in the outer load.

8. **Deprecate `?run-scripts`?** Not in this ticket. After dogfood,
   `?run-scripts` likely becomes "legacy file-wide opt-in" and most
   new code reaches for `dw/controller`. Reassess later.

9. **`@scope` in `<style>` tags** — out of scope for this ticket
   (browser handles it), but worth noting in docs as the canonical
   CSS co-location pattern.

10. **Single-file showcase demo.** Worth building a tiny example
    (`views/showcase/component.html`?) that demonstrates the full
    pattern: scoped style, controller script, markup. Could replace
    `counter.html` or live alongside.
