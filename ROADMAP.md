# Beta Roadmap

What stands between today and a beta release. Items move to `[x]` as they
land. Anything not on this list is explicitly out of scope for beta — see
the bottom section.

"Beta" here means: library is stable enough that breaking changes get
release notes; the site around it doesn't undersell what shipped.

---

## Framework code

- [ ] **Fix failing unit test.** `tests/unit/component.test.ts:570` —
  `$data-* computed values > warns once per key when DevTools edits a
  computed-bound attribute`. Confirm it's a real defect (warn isn't
  firing) vs. a timing assertion that needs `tick()`. Fix accordingly.

- [ ] **Document the `load` / `dw/load` bubbling split in FRAMEWORK.md.**
  The Lifecycle Events table (line 518) lists `load` as bubbling; after
  the load-bubble fix it doesn't. Note that `load` is non-bubbling to
  match `HTMLElement.onload`, and `dw/load` is the bubbling alias for
  catching descendant connects.

- [ ] **Resolve any remaining `NOTE` comments in `src/lib/`.** Earlier
  pass concluded most were misinformed and got stashed; confirm none
  are flagging real defects before declaring the surface stable.

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
