# Framework Website Page Shape Brief

**Purpose:** Guide local agents while building a public site for a small, browser-native JavaScript framework/hobby project.  
**Audience:** AI coding agents, docs agents, design agents, and future maintainers.  
**Date compiled:** July 8, 2026.  
**Research basis:** Top-level navigation, docs structure, and showcase patterns from major JavaScript framework sites.

---

## 1. Executive Summary

Modern JavaScript framework sites converge around a predictable shape:

```text
Homepage → Quick Start → Learn/Guide → Reference/API → Examples/Tutorials → Playground → Ecosystem/Community/Blog
```

The common winning pattern is a clean split between:

- **Learning content**: conceptual docs, tutorials, guides, “build your first thing.”
- **Reference content**: exact syntax, directives, APIs, lifecycle, edge cases.
- **Interactive proof**: playgrounds, sandboxes, REPLs, live examples, component galleries.
- **Trust signals**: GitHub, changelog, examples, comparisons, principles, use cases.

For a small framework, the site should not try to look like a massive ecosystem on day one. It should instead feel **focused, tasteful, hands-on, and deeply aligned with the framework’s philosophy**.

For this project, the strongest positioning is:

> **The framework is the browser.**  
> Data Wrapper turns native HTML documents into reactive components using browser primitives: HTML, attributes, templates, scoped styles, module scripts, native events, and URLs.

The site should prove that claim immediately with a live component playground.

---

## 2. Survey of Major Framework Site Shapes

| Framework | Top-level shape | Useful lesson |
|---|---|---|
| Angular | Home, Docs, Tutorials, Playground, Reference | Very canonical docs architecture. Clear separation between tutorials, reference, and playground. |
| React | Learn, Reference, Community, Blog | Excellent Learn vs Reference split. Homepage teaches through progressive embedded examples. |
| Vue | Quick Start, Guide, Tutorial, Examples, API, Glossary, Error Reference, Resources, Libraries, News | Very complete docs taxonomy. Strong model for mature documentation and ecosystem navigation. |
| Svelte | Docs, Tutorial, Packages, Playground, Blog; docs also split into Svelte, SvelteKit, CLI, AI | Polished, compact, and interactive. The tutorial/playground are first-class product surfaces. |
| Solid | Docs, Tutorial, Templates, Ecosystem, Contribute, Reference | Docs-centric and practical. Good model for separating core docs from router/meta-framework docs. |
| Qwik | Docs, Ecosystem, Tutorial, Qwik Sandbox, Blog, Showcase | Strong show-off mode: sandbox, showcase, performance story, deploy/integration story. |
| Preact | Tutorial, Guide, About, Blog, REPL | Compact and conversion-oriented. Good migration angle: “Switch to Preact.” |
| Lit | Documentation, Learn, Playground, Blog | Very relevant for browser-native positioning. Emphasizes web components and interoperability. |
| Alpine | Docs, Components, GitHub | Minimalist and directive-driven. Homepage itself teaches by listing primitives like `x-data`, `x-bind`, `x-on`, etc. |
| Mithril | Guide, API, Chat, GitHub | Old-school, compact, no-nonsense. Strong “small, fast, practical” framing. |
| Ember | Docs, Releases, Blog, Community, About | Mature framework with strong trust signals: stability, batteries included, releases, upgrades, addons. |
| Astro | Documentation, Blog, Themes, Integrations, Site Showcase, Tutorials, Community, Enterprise | Strong ecosystem/product site. Excellent model for themes, showcase, integrations, AI docs, and migration docs. |
| Nuxt | Docs, Modules, Templates, Resources, Enterprise, Updates, Showcase | Excellent ecosystem marketplace model: modules, templates, showcase, enterprise paths. |
| htmx | Docs, Reference, Examples, Talk, Essays | Best philosophical wedge model. “Essays” are useful when the framework is making an argument about the web. |

---

## 3. Common Required Pages

These are the practical minimum requirements for a credible framework/library site.

### 3.1 Homepage

The homepage must answer, above the fold:

1. What is this?
2. Why does it exist?
3. What can I build with it?
4. How do I try it right now?

Minimum homepage sections:

```text
Hero
Tiny runnable example
Why this exists
Core primitives
Live demo / playground CTA
Comparison or philosophy teaser
Install / Quick Start
GitHub / docs / changelog links
```

Recommended hero framing:

```text
Build reactive HTML components with the browser you already have.

Data Wrapper lets a component be a real HTML file: template, style, and module script together — loaded directly into the page with native events, scoped state, and zero build step.
```

### 3.2 Quick Start

The Quick Start must get someone from zero to a working component in under five minutes.

It should include:

- CDN/script installation.
- Minimal page shell.
- Minimal component file.
- What should appear in the browser.
- One small explanation of the binding/action model.
- A link to the playground.

Example shape:

```text
1. Add Data Wrapper
2. Create counter.html
3. Use <data-wrapper src="/components/counter.html"></data-wrapper>
4. Open the page
5. Change the component
6. Next: learn tokens/directives
```

### 3.3 Learn / Guide

This is for conceptual understanding, not exhaustive API detail.

Suggested guide pages:

```text
Introduction
Mental Model
HTML Components
Loading Components
Templates
State
Readers
Actions
Events
Lists
Styling
Composition
Debugging
```

Each guide page should include:

- One concept.
- One tiny example.
- One practical “when to use this” note.
- Link to the corresponding reference page.

### 3.4 Reference / API

The reference should be exact, boring, and complete.

Suggested reference pages:

```text
Tokens
Directives
Component File Format
Loader API
Module Exports
State Semantics
Reader Semantics
Action Semantics
Event Modifiers
List Rendering
Template Rules
Lifecycle
Errors
```

Reference pages should avoid marketing language. They should specify behavior precisely.

### 3.5 Tutorial

Tutorials should build real things, not just demonstrate syntax.

Recommended first tutorials:

```text
Build a Counter
Build a Todo Widget
Build Tabs
Build a Theme Switcher
Build a Search/Filter List
Build a Modal
Build a Component Library Page
```

The tutorial should be incremental, with each chapter producing a working result.

### 3.6 Examples

Examples are for pattern recognition and copy/paste discovery.

Suggested example gallery:

```text
Counter
Todo List
Tabs
Accordion
Modal
Dropdown
Theme Switcher
Search and Filter
Form Binding
Fetch and Render
Nested Components
List Item Component
```

Each example should have:

- Live preview.
- Source code.
- “Open in Playground” button.
- Short explanation.
- Tags: `state`, `events`, `list`, `forms`, `composition`, etc.

### 3.7 Playground

This is the most important show-off feature for this project.

The ideal playground has:

- Left pane: editable HTML component file.
- Right pane: rendered component.
- Console/log output.
- Optional tabs for `index.html`, `component.html`, and maybe `data-wrapper.js` version.
- Reset button.
- Shareable URL or gist export later.

The flagship playground example should show the whole thesis in one file:

```html
<style>
  button {
    font: inherit;
    padding: 0.5rem 0.75rem;
  }
</style>

<template>
  <button @click="increment">Clicked $count times</button>
</template>

<script type="module">
  export let count = 0;

  export function increment() {
    count++;
  }
</script>
```

This demonstrates:

- Native HTML file.
- Scoped style.
- Template markup.
- Module-owned state.
- Exported action.
- Token binding.
- No build step.

### 3.8 Community / GitHub

For beta, this can be simple:

```text
GitHub
Issues
Discussions
Changelog
Contributing
Code of Conduct
```

Do not fake a community. A small honest project feels better than an empty corporate-looking shell.

### 3.9 Blog / Changelog

At minimum, create a changelog. Blog can come later.

Suggested posts:

```text
Introducing Data Wrapper
Why HTML Components?
The Framework Is the Browser
Beta Roadmap
```

A changelog signals active maintenance and gives employers a way to see technical judgment over time.

### 3.10 AI Docs

Modern framework sites increasingly expose AI-friendly docs. This is especially useful for a small framework because agents will otherwise hallucinate APIs.

Recommended files:

```text
/llms.txt
/llms-full.txt
/agent.md
/examples/*.html
/reference/*.md
```

`llms.txt` should be short and link to canonical docs.  
`llms-full.txt` can be a single bundled text file with the full reference and examples.  
`agent.md` should tell local agents how to build with the framework.

---

## 4. Cool Features Worth Stealing

### 4.1 Browser Playground / REPL

Observed in Angular, Svelte, Lit, Qwik, Preact, Mithril-adjacent examples, and other docs ecosystems.

For Data Wrapper, this should be the centerpiece.

Agent task:

```text
Build a playground where users edit a single HTML component file and see it rendered live.
```

Success criteria:

- User can edit template, style, and script.
- User can click a rendered component and see state update.
- Errors are visible and friendly.
- The default example is impressive in under 20 lines.

### 4.2 Interactive Tutorial

Observed strongly in Angular, Vue, Svelte, Solid, Lit, Astro, and Qwik.

Agent task:

```text
Create a tutorial shell that can eventually host lessons, even if beta only ships 2-3 lessons.
```

Beta lessons:

```text
1. Counter
2. Todo
3. Theme Switcher
```

### 4.3 Directive / Token Catalog

Alpine’s homepage is a strong model: the homepage doubles as a catalog of primitives.

For Data Wrapper, build a visual catalog of:

```text
$count
@submit
@click
*if
*for
*match
<template>
<script type="module">
export let
export function
```

Each primitive should show:

- Name.
- One-line purpose.
- Tiny example.
- Link to reference.

### 4.4 Examples Gallery

Observed in Vue, htmx, Mithril, Qwik, Astro, Nuxt, and Preact-style sites.

For Data Wrapper, examples should be especially important because the framework is small and pattern-driven.

Agent task:

```text
Create /examples as a gallery of live components, each linked to source and playground.
```

### 4.5 Migration / Comparison Pages

Preact’s migration/conversion framing is useful. Astro’s migration docs are also a strong model.

For Data Wrapper, suggested comparison pages:

```text
Data Wrapper vs Alpine
Data Wrapper vs Stimulus
Data Wrapper vs Web Components
Data Wrapper vs Petite Vue
Data Wrapper vs React/Svelte
```

Tone rule:

> Do not dunk on other frameworks. Show where Data Wrapper is simpler, where it is weaker, and when users should choose something else.

### 4.6 Philosophy / Essays

htmx is the best model here. It has docs and reference, but also essays because it is making an argument about HTML.

Data Wrapper should have one or two essays:

```text
The Framework Is the Browser
HTML Components as the Missing Middle
```

These pages should explain the taste behind the framework and make the project memorable.

### 4.7 Showcase / Built With

This can be tiny at first.

Suggested beta showcase:

```text
This site is built with Data Wrapper
Todo demo
Theme switcher demo
Component gallery demo
```

Later:

```text
User projects
Employer-facing case study
Performance demo
```

---

## 5. Recommended Site Architecture for Data Wrapper

### 5.1 Full Target IA

```text
/
  Home
  Docs
    Quick Start
    Core Concepts
    HTML Components
    State & Modules
    Tokens & Directives
    Loading Components
    Styling / Scoped CSS
    Events & Actions
    Lists / Templates
    Composition
    Debugging
    API Reference
  Tutorial
    Build a Counter
    Build a Todo Widget
    Build Tabs
    Build a Theme Switcher
  Playground
  Examples
    Counter
    Todo
    Tabs
    Modal
    Search / Filter
    Theme Switcher
    Form Binding
    Nested Components
  Reference
    Tokens
    Directives
    Loader API
    Module API
    Events
    Lifecycle
    Error Reference
  Philosophy
    The Framework Is the Browser
    Why HTML Components?
    Data Wrapper vs Alpine
    Data Wrapper vs Stimulus
    Data Wrapper vs Web Components
  Blog / Changelog
  Community
    GitHub
    Issues
    Discussions
  AI
    llms.txt
    llms-full.txt
    agent.md
```

### 5.2 Beta IA

Do this first:

```text
/
/docs
/docs/quick-start
/docs/concepts
/docs/tokens
/docs/reference
/tutorial
/examples
/playground
/philosophy
/changelog
/llms.txt
/llms-full.txt
/agent.md
```

### 5.3 Absolute Minimum IA

If time is limited:

```text
Home
Quick Start
Tutorial
Reference
Examples
Playground
GitHub
```

---

## 6. Homepage Blueprint

### Hero

Goal: explain the project instantly.

Suggested copy:

```text
Reactive HTML components, no build step.

Data Wrapper lets you write components as plain HTML files with a template, scoped styles, and module state. Load them into any page and let the browser do the rest.
```

Primary CTAs:

```text
Get started
Open playground
View on GitHub
```

### Hero Code Demo

Show this directly on the homepage:

```html
<data-wrapper src="/components/counter.html"></data-wrapper>
```

And next to it:

```html
<template>
  <button @click="increment">Clicked $count times</button>
</template>

<script type="module">
  export let count = 0;
  export function increment() { count++; }
</script>
```

### Section: Why this exists

```text
Most frameworks ask you to move away from HTML before you get interactivity.
Data Wrapper goes the other way: keep HTML as the unit of composition, then add just enough runtime to bind state, actions, lists, and templates.
```

### Section: Core primitives

Cards:

```text
HTML components
Module state
Token bindings
Native events
Templates and lists
Scoped styles
```

### Section: Try it live

Embed the playground or a small live component.

### Section: Good fit / not a good fit

This increases trust.

Good fit:

```text
Small interactive islands
Design-system demos
Static sites needing behavior
Docs sites
HTML-first apps
Progressive enhancement experiments
```

Not a good fit:

```text
Huge SPA teams needing mature ecosystem guarantees
Complex server rendering pipelines
Enterprise-scale routing/data conventions
Native mobile apps
```

### Section: Philosophy

```text
The browser already has modules, templates, URLs, styles, forms, events, and custom elements.
Data Wrapper tries to connect those primitives instead of replacing them.
```

---

## 7. Agent Instructions

Use these rules when generating site pages, examples, and docs.

### 7.1 Voice and Tone

Use this voice:

- Clear.
- Practical.
- Browser-native.
- Slightly opinionated.
- Humble about scope.
- No corporate fluff.

Avoid:

- “Revolutionary.”
- “Enterprise-grade” unless proven.
- Empty claims like “blazing fast.”
- Dunking on React, Angular, Vue, etc.
- Pretending the ecosystem is mature.

Preferred phrasing:

```text
small
native
plain HTML
browser primitives
component file
zero build step
just enough runtime
```

### 7.2 Documentation Rules

Every docs page should include:

```text
Title
One-sentence summary
Minimal example
Explanation
Common mistake
Related reference links
```

Keep examples short. Prefer one complete example over many fragments.

### 7.3 Example Rules

Every example should include:

```text
Live preview
Source code
Open in Playground
What it demonstrates
Relevant docs links
```

Examples should be real HTML component files whenever possible.

### 7.4 Reference Rules

Reference pages must be precise.

For each token/directive/API:

```text
Name
Purpose
Syntax
Allowed values
Example
Behavior
Edge cases
Related APIs
```

### 7.5 Design Rules

Design should communicate:

- Native web.
- Source code as first-class object.
- Small composable pieces.
- Clarity over decoration.

Recommended visual motifs:

```text
HTML file cards
Split-pane editor/preview
DOM tree / component tree hints
Token chips
Attribute badges
```

Avoid overdesigned “startup SaaS” styling. This should feel like a craft tool for frontend engineers.

---

## 8. Suggested First Work Tickets

### Ticket 1: Build site shell

```text
Create the main site shell with top nav: Docs, Tutorial, Examples, Playground, Philosophy, GitHub.
Include mobile nav, search placeholder, and footer.
```

Acceptance criteria:

```text
- Responsive layout
- Active nav states
- Footer links
- GitHub link
- Accessible keyboard navigation
```

### Ticket 2: Build homepage

```text
Create homepage with hero, code demo, value prop, core primitives, playground CTA, and good-fit/not-fit section.
```

Acceptance criteria:

```text
- Shows a Data Wrapper component example above the fold
- Has Get Started and Playground CTAs
- Explains “HTML component file” clearly
```

### Ticket 3: Build Quick Start

```text
Write the Quick Start page that gets a user from blank HTML page to a working counter component.
```

Acceptance criteria:

```text
- Includes install step
- Includes host page code
- Includes component file code
- Includes expected result
- Links to next docs page
```

### Ticket 4: Build Playground MVP

```text
Create a two-pane playground: editable component source on the left, rendered preview on the right.
```

Acceptance criteria:

```text
- Default counter example renders
- User edits source and preview updates
- Runtime errors are visible
- Reset button works
```

### Ticket 5: Build examples gallery

```text
Create /examples with cards for Counter, Todo, Tabs, Theme Switcher, Search Filter, and Modal.
```

Acceptance criteria:

```text
- Each card has title, description, tags
- Each example links to source and playground
- At least 3 examples render live
```

### Ticket 6: Build reference skeleton

```text
Create reference pages for tokens, directives, module exports, events, lists, and loader API.
```

Acceptance criteria:

```text
- Every page has syntax, example, behavior, and edge cases sections
- Cross-links to guide/tutorial pages
```

### Ticket 7: Create AI docs

```text
Create /llms.txt, /llms-full.txt, and /agent.md.
```

Acceptance criteria:

```text
- llms.txt links to canonical docs
- llms-full.txt contains the full beta docs/reference/examples in one file
- agent.md tells coding agents how to build examples and docs without hallucinating APIs
```

---

## 9. Recommended Agent Prompt

Use this prompt for local coding agents:

```text
You are helping build the public documentation and showcase site for Data Wrapper, a small browser-native JavaScript framework.

Project positioning:
- The framework is the browser.
- Components are plain HTML files with template, style, and module script.
- The library adds just enough runtime for state bindings, actions, lists, templates, and component loading.
- Prefer native HTML, CSS, JS modules, attributes, events, URLs, and browser DevTools.

Site goal:
Build a credible, employer-impressing framework site with clear docs, live examples, and a playground.

Tone:
Clear, practical, humble, slightly opinionated. No corporate fluff. Do not overclaim maturity.

Information architecture:
Home, Docs, Quick Start, Tutorial, Examples, Playground, Reference, Philosophy, Changelog, AI docs.

Highest-priority feature:
A playground where users can edit a single HTML component file and see it render live.

Documentation rule:
Every docs page must include a one-sentence summary, minimal example, explanation, common mistake, and related links.

Example rule:
Every example must include live preview, source code, Open in Playground link, and what it demonstrates.

Do not invent APIs. If unsure, leave TODOs and ask for the current source of truth.
```

---

## 10. Source Notes

Official sources reviewed for page shape and feature patterns:

- Angular: https://angular.dev/ and https://angular.dev/playground
- React: https://react.dev/
- Vue: https://vuejs.org/
- Svelte: https://svelte.dev/
- Solid: https://docs.solidjs.com/
- Qwik: https://qwik.dev/
- Preact: https://preactjs.com/
- Lit: https://lit.dev/
- Alpine: https://alpinejs.dev/
- Mithril: https://mithril.js.org/
- Ember: https://emberjs.com/
- Astro: https://astro.build/ and https://docs.astro.build/
- Nuxt: https://nuxt.com/
- htmx: https://htmx.org/

---

## 11. Final Recommendation

For beta, build the site around three proof surfaces:

1. **A beautiful homepage demo** showing a complete HTML component.
2. **A live playground** that makes the framework instantly understandable.
3. **A small but precise docs/reference set** that local agents can safely consume.

Do not wait for a huge ecosystem. A small framework can still look serious if the docs are crisp, the examples are live, and the site communicates a coherent philosophy.

The goal is not to look like React. The goal is to look like a thoughtful engineer made a clear tool and documented it well.
