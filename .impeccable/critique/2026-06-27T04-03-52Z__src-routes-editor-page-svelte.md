---
target: editor
total_score: 22
p0_count: 0
p1_count: 3
timestamp: 2026-06-27T04-03-52Z
slug: src-routes-editor-page-svelte
---

# Critique: Editor (`src/routes/editor/+page.svelte`)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                         |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 2         | No save/autosave indicator, no "files auto-delete ~2h" notice, no export-gate/rate hint until hit |
| 2         | Match System / Real World       | 3         | Mostly natural; AcroForm jargon (Combo box, List box, Radio group) unexplained for first-timers   |
| 3         | User Control and Freedom        | 2         | No global undo/redo in an editor; modals/polygon do have escapes                                  |
| 4         | Consistency and Standards       | 2         | TWO Export buttons (toolbar rect + floating pill), mixed gray/slate neutral families              |
| 5         | Error Prevention                | 2         | Good link-warning + export gate; no confirm on clear-source / delete-page                         |
| 6         | Recognition Rather Than Recall  | 3         | Tools are text-labeled (good); page-panel icon controls unlabeled (title-only)                    |
| 7         | Flexibility and Efficiency      | 1         | No keyboard shortcuts for tools/export/undo; no bulk page ops                                     |
| 8         | Aesthetic and Minimalist Design | 2         | 16 always-on equal-weight tools = wall of options; no primary; empty gray dominates               |
| 9         | Error Recovery                  | 3         | Plain-language errors; upsell reassures "your edits are still here" (excellent)                   |
| 10        | Help and Documentation          | 2         | Good contextual polygon/placement hints; no shortcuts, no first-run help                          |
| **Total** |                                 | **22/40** | **Acceptable — significant improvements needed**                                                  |

## Anti-Patterns Verdict

**LLM assessment:** Low slop. Clean, familiar, no gradient/glass/eyebrow clichés. But it reads slightly _unfinished_ rather than _designed_: a flat row of 16 identical-weight text buttons, a generic centered empty-state card floating in a sea of `bg-gray-100`, and no visual primary. By the product test (would a Linear/Figma/Sejda-fluent user trust it), it passes on familiarity but stalls at the wall-of-tools and the duplicate Export.

**Deterministic scan:** 1 warning — `gray-on-color` at `Canvas.svelte:156` (`text-gray-500` on hover `bg-blue-50`, the "+ Add page" button). Minor; resolves to blue on hover.

**Visual evidence:** Two viewport screenshots (empty + blank-canvas). The blank canvas opened at **249% zoom** with a horizontal scrollbar — fit-to-width over-zooms portrait pages in a wide canvas.

## Overall Impression

The editor is functionally rich and the bones are right, but it shows the whole instrument at once and doesn't guide the eye. Two problems undercut trust immediately: a blank page that opens at 249% (you can't see the page you just made), and two identical Export buttons competing on screen. Biggest opportunity: progressive disclosure + a single confident primary action, exactly the "Quiet Workbench / tool-gets-out-of-the-way" line from PRODUCT.md.

## What's Working

- **Upsell modal copy** — "Your edits are still here — try again later, or get more now." Reassurance at the exact emotional valley. On-brand ("never make the user feel hunted").
- **Contextual hints** — polygon gesture banner and image/signature placement hint appear only when that tool is active. Right amount, right time.
- **Text-labeled tools** — no icon-only guessing; good for first-timers and accessibility.

## Priority Issues

**[P1] Blank canvas opens at 249% zoom.** Fit-to-width on a portrait page in a wide viewport over-zooms; the user can't see the page and gets a horizontal scrollbar. Fix: clamp the initial fit (fit-to-_height_ or `min(fitWidth, 100%)`) so a new page lands fully visible. → `/impeccable optimize` or a targeted fix in `Canvas.svelte` fit logic.

**[P1] Two Export buttons.** Toolbar rectangle (top-right) and floating pill (bottom-right) are the same action, same color, different shape — duplicated and inconsistent. Pick one. The floating pill over the canvas is the stronger affordance; demote or remove the toolbar one. → `/impeccable layout`.

**[P1] No undo/redo.** An editor without undo fails the first thing a power user reaches for and the first thing a nervous first-timer needs. Add a history stack + visible Undo/Redo (and Cmd/Ctrl+Z). → `/impeccable harden`.

**[P2] Wall of 16 equal-weight, always-on tools.** Content (4) + Fields (7) + Shapes (5) are flat, same weight, and fully active even in the empty state with no document. Establish hierarchy (primary actions vs secondary), and gate/disable insert tools until a page exists. Fields' 7 items exceed the ~4 working-memory comfort. → `/impeccable layout` + `/impeccable distill`.

**[P2] Neutral-family drift (gray vs slate).** Canvas and toolbar use `bg-gray-100` / `gray-*` while the rest of the app and DESIGN.md standardize on slate. Violates the One-Neutral Rule. Migrate `gray-*` → slate. → `/impeccable colorize` (scoped to neutral migration).

## Persona Red Flags

**Alex (Power User):** No keyboard shortcuts for tools, export, or undo — every action is a mouse trip. No undo/redo at all. Will feel slow and patronized.

**Sam (Accessibility):** Page-panel controls (↑ ↓ ⟳ delete) are icon-only with `title` tooltips and very low-contrast (~slate-400) glyphs — fail 4.5:1 and screen-reader clarity. Group labels CONTENT/FIELDS/SHAPES are tiny low-contrast gray. Tool active-state relies on color alone.

**Mara (task-driven occasional user, from PRODUCT.md):** Lands to fill one form. Sees 16 tools + two Export buttons + a 249%-zoomed page. No "where do I start" guidance beyond the empty card; AcroForm terms (Combo box, List box) mean nothing to her. Risk of bouncing before the first edit.

## Minor Observations

- Empty-state card is generic and under-uses its space; no drag-and-drop affordance is signaled even though the canvas could accept a drop.
- No "files auto-delete in ~2h" or privacy reassurance surfaced — a trust signal that fits the brand.
- `Document ▾` menu uses `position:absolute` inside the header; verify it isn't clipped by overflow at narrow widths.
- "+ Add page" hover text (`gray-500`→`blue-600`) is the lone detector hit; folds into the slate migration.

## Questions to Consider

- What if insert tools were hidden/disabled until a document exists, so the empty state has a single focus: get a PDF in?
- Does the user need 16 tools visible at once, or could Fields/Shapes collapse into grouped menus like Document already does?
- What would a confident single Export affordance look like — and should it preview what the export gate will check?
