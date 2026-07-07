## Honesty / calibration (non-negotiable, table stakes)

Never state a fact about an external UI, dashboard, API, tool, or version you
have not verified *this session*. Tag every non-trivial factual claim inline:
`(verified: <source>)` or `(guess)`. If something is behind auth, unreadable, or
otherwise uncheckable, say "I can't see that — show me" and **stop**; do not
narrate a plausible-sounding version of it. A short "I don't know" beats a fluent
guess. Confident-but-unverified is the failure mode to avoid, always.

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

---

# Project: data-wrapper

Zero-dependency, HTML-first reactivity built on a single Web Component
(`<data-wrapper>`). No build step, no virtual DOM, no JSX.

- **Source** in `src/lib/`: `utils.ts` (binding parser `pURL`, `readPath`),
  `engine.ts` (binding contexts, `wake`/`wire`/`resolveSource`, reconcile,
  `*list`/`*if`), `component.ts` (`ComponentRuntime`, `action`/`flush`),
  `element.ts` (`<data-wrapper>` + `load()`), `index.ts` (re-exports).
- **Docs are dogfooded**: each section is a `<data-wrapper>` view in `views/docs/`
  mounted by `framework.html`. A feature isn't done until its doc is true.
- **Tickets** in `tickets/NNN-*.md`. `tickets/000-minor-quibbles.md` is a *living*
  list of small follow-ups — small quibbles go there, not into new tickets.
- **`collab.md`** holds the project ethos and the active Claude↔Codex threads —
  read it first. Ethos in one breath: platform-first; collapse-don't-bolt-on;
  minimal grammar / single interface; documentation-first; honest about gaps;
  no error slop (only handle failures a dev will actually hit — loud throw is the
  default).

## Workflow

- Two assistants collaborate via `collab.md`: **Claude** and **Codex**. Roles
  swap each phase/ticket (one implements, the other writes tests + reviews); the
  user is the lead who ratifies decisions. Leave review comments on the ticket —
  the other assistant picks them up.
- **Never run destructive/mutating shell commands** (`rm`, `git rm`, `git mv`) —
  hand the user the exact command instead; the permission prompt stalls the loop.
  Read-only `git` (status/log/diff/grep) is fine; edit files via Edit/Write.
- The user moves fast and values momentum, decisiveness, and honest reporting
  (own mistakes plainly). Don't re-surface settled decisions as questions.

## Testing

- **Contract tests, not unit tests** (see `testing.md`). Drive the public surface
  — `new ComponentRuntime(...)` + `wake(wrapper, rootContext(wrapper))` + the real
  DOM, or `action`/`flush`. Assert observable behavior; never call internal
  helpers (`resolveSource`, `formatter`) or assert private fields. One test per
  distinct behavior; less is more.
- **Build test DOM with `createElement`/`setAttribute` and `template.content.append`,
  NOT `innerHTML`.** happy-dom handles `innerHTML` + `<template>` differently and
  produces false failures; the createElement pattern is what the green suite uses.
- `bun review` = `tsc --noEmit` + `bun test`. The loader (`load()`, `fetch`,
  dynamic `import`, import maps) is happy-dom's blind spot — stub `globalThis.fetch`
  + `importShim`, or test engine-direct.
- Test helpers (`mount` / `wrapperWithRuntime` / `structuralTemplate` / `el`) are
  duplicated across test files — consolidating into `tests/helpers.ts` is ticket
  000.

## Improve next session

- **Verify before asserting.** Read the *actual code* before claiming a defect or
  diagnosis — not ticket text or a remembered earlier state. This session I twice
  reasoned from stale context: a `reconcile` "bug" was already fixed by a different
  guard, and the proposed fix would have regressed an optimization. The tree moves
  fast and Codex's in-flight work (sometimes from the *next* ticket) bleeds across
  files — use `git log`/`status` to separate committed from in-progress and scope
  reviews to the right ticket.
