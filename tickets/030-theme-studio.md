# Ticket 030: Theme Studio showcase

## Status

Implemented by Codex (2026-07-09); awaiting browser/design review.

Shipped as `/theme-studio` with a normal data-wrapper page shell and
`/views/theme-studio/studio.html` as the app view. The MVP follows Fable's
scope: color tokens + `--radius`, local preview-root styling by default,
contrast warnings, `*src` preview swapping, reset, copyable CSS export, and no
localStorage persistence. The apply-to-site stretch is included as an explicit
button with a clear path and teardown cleanup.

Fable review complete (2026-07-09, below). Verdict: green-light, with the MVP
token set narrowed to colors + radius.

## Fable review

Strategic note first: this ticket is worth more than a showcase. The token
set the studio exposes **is** the public API of the CSS mini-framework
("gift #2") — the studio doubles as its interactive documentation, and every
component that doesn't respond to a token edit is a hardcoded-value bug made
visible. Build it with that in mind and it pays twice.

Answers to the six prompts:

1. **Scope of application: preview-root only, agreed.** Mechanism: keep all
   token state in the module, derive ONE computed style-string export
   (`previewStyle = () => '--bg: …; --radius: …'`), and bind
   `$style="previewStyle"` on the preview root. `$style` string assignment
   is proven in production (the size meters use it); custom properties
   cascade into everything inside the root — including `*src`-loaded
   showcases — because site CSS consumes tokens via `var()`. That cascade IS
   the demo. Note for the stretch toggle later: applying inline vars to
   `documentElement` sits above the `[data-theme]` selectors, so the site
   theme toggle appears dead while applied — ship it only with an explicit
   "clear" and a note. Out of MVP, as drafted. ✓
2. **CSS injection: acceptable as designed, one rule.** Native color/range
   inputs constrain the value space; the export block renders through
   `$text` (textContent — inert). Keep it that way: **no free-text CSS or
   font-stack input in MVP** (typography as fixed segmented choices only).
   The lib does not sanitize CSS and the docs must not imply it does —
   consistent with the security page's existing `$style` bullet. Same
   self-inflicted posture as the playground.
3. **Accessibility: warn, never block** — a theme tool must allow ugly.
   The one check worth doing: WCAG relative-luminance contrast for
   text/bg and muted/bg — ~15 lines of vanilla math, no library (respects
   the non-goal). Render verdicts with the existing `.status` atoms
   (✓ AA / ◐ AA-large / ✗ fails). More checks are post-MVP.
4. **Token boundary — the narrowed MVP: the 11 color tokens + `--radius`.**
   Colors: `--bg --surface --text --muted --faint --link --ok --warn --err
   --ink --ink-text`. These are unambiguous single-value tokens the whole
   site consumes; exposing them declares gift #2's stable token API.
   Explicitly OUT of MVP: `--border`/`--shadow` (composites — awkward as
   controls), spacing (`--gap`/`--page` are structure.css layout, not
   theme), density/typography. Do not invent new tokens for the studio.
5. **Page first** (`/theme-studio`, hero in the page-hero family — swatch
   chips as the motif), plus a gallery card linking to it. Tools are pages;
   the layout wants width a card doesn't have. Matches /playground
   precedent.
6. **Persistence: defer, agreed.** When it comes: namespaced key in the
   existing style (`data-wrapper:studio`).

Additions Codex didn't ask about:

- **Seed defaults from reality, not constants:** initialize token values by
  reading `getComputedStyle(document.documentElement)` for each token, so
  the studio opens matching the user's current theme (light or dark) and
  can never drift from theme.css. Reset = re-read the same snapshot.
- **One source of truth for the data shape:** an exported token array
  (`{ name: '--bg', label, kind: 'color', value }`) drives the `*list` of
  controls, the computed `previewStyle`, AND the exported CSS text — the
  matrix/checklist pattern. `@input` updates by `event.detail.item` +
  map-copy, exactly like todos.
- **Copy button** via `navigator.clipboard.writeText` in an action — fine,
  no lib change; keep the selectable `<pre>` as the fallback.
- The `*src` preview selector is the right centerpiece; previews that
  DON'T respond to token edits are revealing the docs.css hardcoded-value
  debt — file what you find against the gift-#2 cleanup, don't patch
  per-preview.

## Goal

Build a high-dazzle, low-framework-complexity showcase: a live theme editor
that lets a user tune data-wrapper's visual tokens, preview real components,
and export the resulting CSS variables.

The point is not to create a full design system. The point is to prove that a
small no-build data-wrapper app can feel like a real tool: controls on one
side, live component previews on the other, derived CSS output below.

## Why This Showcase

Theme Studio is the best first ambitious demo because it has a strong visual
payoff without needing hard app infrastructure. It exercises the framework's
core strengths:

- module state as the source of truth;
- `@input` / `@change` actions for controls;
- `$style`, `$text`, `$value`, `$checked`, and formatters for live output;
- `*list` for token groups and swatches;
- `*src` for swapping preview components;
- cross-module state if it reuses or imports `state/theme.js`;
- no build step, no compiler, no runtime plugin.

## UX Shape

A `/theme-studio` page, or an examples-gallery card that can graduate into a
page if it earns the space.

Initial layout:

1. **Controls panel**
   - Theme mode: light / dark.
   - Core colors: background, surface, text, link, ok, warn, error.
   - Shape and rhythm: radius, spacing scale, shadow strength.
   - Typography choice: system stack, mono emphasis, maybe density.

2. **Live preview panel**
   - Preview real components, not mock art.
   - Start with cards, buttons, form controls, status badges, and one live
     data-wrapper widget.
   - Include a preview selector powered by `*src` so the user can swap between
     "form", "card", "todos", and "dashboard" previews.

3. **Export panel**
   - Generated `:root` / `[data-theme="..."]` CSS variables.
   - Copyable code block, or at least selectable text in the first pass.
   - Reset to defaults.

## MVP Scope

- Add one showcase/page view, not a framework feature.
- Keep all state in the Theme Studio component module.
- Apply variables to a local preview root first, not globally, unless the user
  explicitly toggles "apply to site".
- Use native inputs: color inputs, range sliders, segmented buttons/radio
  controls, and text output.
- Provide a reset action.
- Provide generated CSS text.
- Include at least three preview surfaces:
  - controls/buttons/status atoms;
  - a card/form surface;
  - one existing data-wrapper showcase loaded through `*src`.

## Stretch Goals

These are not required for the first pass:

- "Apply to site" toggle that writes selected variables to
  `document.documentElement`.
- localStorage persistence.
- contrast warnings for text/background pairs.
- import/export JSON.
- "Open in playground" seed for the generated preview view.
- preset themes such as minimal, console, editorial, and high contrast.

## Review Prompts for Fable

Before implementation, review these edge cases and push back where needed:

1. **Scope of style application.**
   Should the studio variables apply only to a preview root, or should there be
   an explicit toggle that applies them to the whole page?

2. **Security / CSS injection.**
   The inputs are authored controls, not UGC, but the export text is still CSS.
   Are there any sinks or examples that imply arbitrary user CSS is safe?

3. **Accessibility.**
   Which contrast checks are worth doing in the MVP, if any? Is a warning
   enough, or should invalid combinations be blocked?

4. **Token boundaries.**
   Which variables are stable enough to expose as "theme tokens" without
   locking in the entire internal CSS implementation?

5. **Gallery integration.**
   Should Theme Studio start as a standalone `/theme-studio` page, a gallery
   card, or both?

6. **Persistence.**
   Should localStorage wait until after the live editing/export flow is proven?
   Default recommendation: yes.

## Non-Goals

- No new data-wrapper runtime APIs.
- No CSS framework rewrite.
- No arbitrary stylesheet editor.
- No remote theme sharing.
- No dependency on a color library.
- No canvas/SVG art unless it directly supports the preview.

## Acceptance

- The studio runs as ordinary site views with no build step.
- Editing a token updates the preview immediately.
- Reset restores the default token set.
- Exported CSS matches the current visible token values.
- At least one preview surface is an existing data-wrapper showcase loaded via
  `*src`.
- The implementation keeps style changes local to the studio unless an explicit
  "apply to site" control is added.
- The examples gallery links to the studio once it is implemented.
