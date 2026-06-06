# Beta Roadmap

What stands between today and a beta release. Items move to `[x]` as they
land. Anything not on this list is explicitly out of scope for beta — see
the bottom section.

"Beta" here means: library is stable enough that breaking changes get
release notes; the site around it doesn't undersell what shipped.

---

## Recently shipped

- [x] **JS-free state writes via `put:` protocol** — see
  `RFC-bidirectional-bindings.md`. Controlled inputs collapse from
  `$value + name + @change + register handler` to
  `$value + @change="put:/path"` (or `put:./path` inside `*list` rows).
  Includes:
  - **Symmetric `Source`** (read/write/subscribe all total).
  - **Generalized `resolve()`** via `Handler` + `DEFAULT_HANDLER` and
    `toHandler` bridge for `DW_PROTOCOLS`.
  - **`$data-*` writeback gated on protocol** at engine.ts:478 — closes
    the cycle hole that symmetric `write` would otherwise open.
  - **`wakeOwned` indirection dropped.**
  - **`pURL()` parser fix** for opaque-scheme URLs (`put:./done`,
    `put:done`, `put:/done` all parse correctly).
  - **Element-aware `collectPayload`** (two cases: checkbox, multi-select).
  - **Row identity markers** (`_key` set by reconcile) drive row-relative
    writes without WeakMaps or parallel JS caches.
  - **POC live** at `views/showcase/put.html`.

## Framework code

- [x] **Fix failing unit test.** `tests/unit/component.test.ts:570` —
  passes reliably after Phase 1/2. Was a timing assertion that now lands
  in order with the surrounding changes; keep an eye on it across future
  test-runner versions.

- [ ] **Document the `load` / `dw/load` bubbling split in FRAMEWORK.md.**
  The Lifecycle Events table (line 518) lists `load` as bubbling; after
  the load-bubble fix it doesn't. Note that `load` is non-bubbling to
  match `HTMLElement.onload`, and `dw/load` is the bubbling alias for
  catching descendant connects.

- [ ] **Resolve any remaining `NOTE` comments in `src/lib/`.** Earlier
  pass concluded most were misinformed and got stashed; confirm none
  are flagging real defects before declaring the surface stable.

- [ ] **Targeted tests for the `put:` surface.** `put:` dispatch shape
  (path + isRel in detail), `elementValue` cases (checkbox, multi-select,
  default), `handlePut` absolute + row-relative branches, reconcile sets
  `_key`. Soft: dogfood via `put.html` has covered the happy paths.

- [ ] **Migrate `views/showcase/todos.html` to `put:`** — acceptance
  test for the design end-to-end against an existing demo. Collapse
  the toggle/remove/filter handlers; keep cascade-needing logic
  (`status` derivation) imperative or move to a render-time formatter.

- [ ] **Optional: reconcile diff-before-publish.** Current row update
  loop (engine.ts:167-170) republishes every channel on the row when any
  field changes, not just the changed ones. Defer unless dogfood shows
  it matters.

## Site

- [ ] **Commit current work.** Staged: today's load-bubble fix
  (`src/lib/component.ts`), the Why-section rhetorical restructure
  (`views/framework/why.html`, `index.html`), the collapsible utility
  (`src/css/atoms.css`), article.css updates, formatters doc tweak.
  Rebuild `dist/` first.

- [ ] **Finish the homepage demo ladder.** Read-only binding → Computed
  values → Loaded view → Todos. Each demo should show the smallest
  possible example of its concept; complexity is monotonic down the page.

- [ ] **How To: hover-to-highlight.** Hovering i/ii/iii in the How To
  ordered list highlights the corresponding fragments in the HTML+JS
  code blocks. Deferred from the rhetorical-flow pass.

- [ ] **Rebuild framework.html as a cookbook.** Right now it's
  effectively a copy of the homepage. Beta needs either a real cookbook
  of common patterns (controlled inputs, computed values, dynamic
  payloads, …) or a clear "coming soon" disposition. Don't ship the
  duplicate.

---

## Out of scope for beta

Roadmap items already scoped in `FRAMEWORK.md` — not blockers, deferred
until dogfood demands them:

- `_` token (Injector) — state islands, `api://` fetch, URL sync
- Additional pURL protocols beyond `localstorage://` (`api://`, `url://`, `session://`)
- Address-bar sync (`_sync="url?keys=…"`)
- PWA service worker + missing icons
- Cycle detection in `$data-*` graphs
- Batched flush / diamond dedup
- Multi-channel subscription per binding (the `/filter` arg in
  `$text="/todos?where=/filter"` isn't itself reactive)
- Wake-time topological order for initial computed writes
- Richer `where` predicate language (comparisons, compositions, nested paths)
- Parametrized formatters (`?format=date:short`)
- `@` dispatch options: `once`, `capture`
- `@` payload modes: `?payload=subtree|scope|none`
