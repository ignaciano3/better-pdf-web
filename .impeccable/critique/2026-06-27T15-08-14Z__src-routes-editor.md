---
target: the editor
total_score: 32
p0_count: 0
p1_count: 2
timestamp: 2026-06-27T15-08-14Z
slug: src-routes-editor
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading/Exporting labels, Unsaved dot, zoom %, active-tool highlight, error banner — solid; no page-render skeleton |
| 2 | Match System / Real World | 4 | Plain, domain-correct labels (Text field, Radio group, Merge/append, Outline/bookmarks) |
| 3 | User Control and Freedom | 4 | Undo/redo, Esc to deselect, Delete, confirm-before-discard, beforeunload guard |
| 4 | Consistency and Standards | 2 | Mixed icon vocabulary: crisp SVGs vs emoji/glyph icons; two competing blue CTAs |
| 5 | Error Prevention | 4 | Confirm dialog, unload guard, invalid-link pre-export warning, numeric min/max constraints |
| 6 | Recognition Rather Than Recall | 4 | Contextual floating toolbar, visible tools, tooltips with shortcut hints |
| 7 | Flexibility and Efficiency | 4 | Tool accelerators, undo/redo shortcuts, drag-to-reorder pages, duplicate |
| 8 | Aesthetic and Minimalist Design | 2 | Marketing header + 3-row toolbar = heavy chrome competing with the canvas; Sign up out-shouts Export |
| 9 | Error Recovery | 3 | role="alert" error banner, specific actionable invalid-link warning |
| 10 | Help and Documentation | 2 | Tooltips and trust microcopy only; no formal help/shortcut reference |
| **Total** | | **32/40** | **Good on desktop — but the score is desktop-weighted; mobile is a P1 the heuristics don't fully capture** |

## Anti-Patterns Verdict

**LLM assessment**: The editor does NOT read as AI-generated — the opposite problem, if anything. The interaction model is unusually deep and considered for a browser tool: undo/redo with real keyboard accelerators, Esc/Delete, a confirm dialog before discarding work, a beforeunload guard, an invalid-link warning *before* export, and a contextual floating toolbar that changes its controls per element type. That's craftsmanship, not slop.

Where it slips is **chrome discipline and platform reach** — exactly the things the project's North Star ("the tool gets out of the way," "the document is the hero") cares most about. Two tells:
1. The full marketing header (logo + Pricing + Log in + a loud blue **Sign up**) sits on top of the editor, so on a work surface the single most prominent pixel is a marketing CTA — and it's blue, the same "this is the action" color as the real primary, **Export PDF**. Two blue CTAs competing dilutes the Action-Blue rule.
2. The Pages panel and floating toolbar use emoji/character glyphs (⟳ ＋ 🗑 ↑ ↓ « » ▾ ⚙) where the rest of the UI uses crisp stroked SVGs. Mixed icon vocabulary is a named product ban, and emoji render inconsistently across platforms.

**Deterministic scan**: detector returned exactly 1 finding — `gray-on-color` at `Canvas.svelte:164`, which is the documented false positive already in `.impeccable/critique/ignore.md` (the "+ Add page" button's slate text only sits on white; the blue wash is paired with blue text on hover). So the automated scan is clean; the real issues here are structural and need eyes.

**Visual evidence**: drove the cached Chromium directly (the Playwright MCP requires Chrome). Captured empty state, blank canvas, active tool, Document menu, a selected text element with its floating toolbar, and mobile — desktop and 390px. No console/page errors in any state.

## Overall Impression

A genuinely well-engineered editor with a thoughtful desktop interaction model, wrapped in too much chrome and a mobile layout that doesn't hold together. The biggest opportunity isn't adding anything — it's *removing*: slim the header on the editor route so the canvas is the hero, make Export the only blue, and let the toolbar collapse gracefully on small screens.

## What's Working

- **The contextual floating toolbar.** Per-element controls (font/size/color for text, stroke/fill/dash for shapes, W/H/opacity/rotate for images, URL-vs-page for links) anchored above the selection. This is recognition-over-recall done right and is the editor's best idea.
- **The empty state.** Clean dashed card, a clear binary choice (Upload PDF / Start blank), and honest trust microcopy ("Your file stays in this browser… your document isn't stored") that closes the privacy loop up front. On-brand.
- **The depth of the interaction model.** Undo/redo + shortcuts, confirm-before-discard, beforeunload guard, invalid-link pre-export warning, the calm amber "Unsaved" dot. This is what "fast, precise, trustworthy" feels like in practice.

## Priority Issues

- **[P1] The editor is barely usable at mobile width.** At 390px the toolbar expands to four stacked rows (Upload/Document, then CONTENT, FIELDS over three lines, SHAPES over two), consuming most of the viewport before the canvas. Below that the Pages panel (`w-44`) sits *side-by-side* with the canvas, stealing ~half the width, and the Export FAB overlaps the zoom pill at the bottom.
  - **Why it matters**: A large share of "fill this form / sign this" traffic is mobile, and the product promises "calm enough for first-timers." Right now a phone user can't comfortably edit.
  - **Fix**: Below `sm`, collapse the insert tools into a single horizontally-scrollable strip or a "Insert ▾" menu; collapse the Pages panel by default (it already has a collapsed-tab affordance — default to it on small screens) and let it overlay rather than share width; lift/inset the zoom pill so the FAB never overlaps it.
  - **Suggested command**: /impeccable adapt

- **[P1] Marketing chrome dominates the work surface; two blue CTAs compete.** The global header's blue **Sign up** is the loudest element on the editor, and it shares the "action" color with the real primary action, **Export PDF**. The tool doesn't get out of the way.
  - **Why it matters**: Directly contradicts the two load-bearing principles — "the tool gets out of the way" and the Action-Blue rule (blue = the one action, ≤10%). It also nudges toward "make the user feel hunted."
  - **Fix**: Give the editor route a slimmer, workspace-appropriate header (logo + account affordance, no marketing nav), or fold account actions into a quiet menu. Demote Sign up to a non-blue treatment on this surface so Export is the only blue primary.
  - **Suggested command**: /impeccable distill

- **[P2] Inconsistent icon vocabulary.** Page controls and some toolbar affordances use emoji/character glyphs (⟳ ＋ 🗑 ↑ ↓ « » ▾ ⚙ ∠ α) while Upload, undo/redo and Export use crisp stroked SVGs.
  - **Why it matters**: Emoji render differently per OS/browser and read toy-ish against the "precise instrument" voice; mixed icon styles are a named product ban.
  - **Fix**: Replace the glyphs with stroked SVGs from the same family as Upload/undo/Export (rotate, plus, trash, chevrons, gear).
  - **Suggested command**: /impeccable polish

- **[P2] Desktop toolbar wraps to three ragged rows at ~1280px.** Upload + undo/redo on the left and Document on the right squeeze the flex-1 section group, so CONTENT/FIELDS/SHAPES break across three rows with uneven whitespace (CONTENT sits alone on row 1 beside a large empty gap).
  - **Why it matters**: On a common laptop width the editor spends ~4 horizontal bands on chrome before the canvas; heavy for a "document is the hero" tool.
  - **Fix**: Tighten the group so it fills the available width before wrapping (or pin Upload/undo/Document and let only the sections wrap on a single track), and reduce the inter-section gap.
  - **Suggested command**: /impeccable layout

## Persona Red Flags

**Casey (Distracted Mobile User)**: Hit hard. Four rows of toolbar push the canvas off-screen, the Pages rail eats half the width, and the Export FAB overlaps the zoom controls — one-handed editing is impractical. This is the editor's weakest persona by far.

**Alex (Power User)**: Well served — single-key tool accelerators, Ctrl/Cmd+Z/Y, Esc/Delete, duplicate, drag-to-reorder pages. Minor friction: the 3-row toolbar wastes vertical space and the page sits left-aligned with dead canvas to the right.

**Sam (Accessibility)**: Mostly strong — aria-labels on icon buttons, `aria-pressed` on tools, `aria-keyshortcuts`, visible focus rings, and an active-tool cue that uses weight + color (not color alone). Watch: emoji-glyph buttons depend on font rendering, and the floating toolbar can extend past the right canvas edge when an element is near it (controls clip off-screen).

## Minor Observations

- The blank page renders left-aligned in the canvas with large empty space to its right; centering it in the available area would look more intentional.
- Default "Fit" on a blank page lands at 218% — technically correct (fit-to-width on a narrow page) but the number reads oddly high; consider fit-to-page as the blank-doc default.
- Floating toolbar overflows the right canvas edge for elements placed near it (Duplicate/Delete clip). Consider flipping the bar's horizontal anchor when it would overflow.
- The Document menu, empty state, and confirm dialog are all clean and on-brand — no notes.

## Questions to Consider

- Should the editor route share the marketing header at all, or does the workbench deserve its own minimal chrome where Export is the only blue?
- On a phone, what's the smallest set of tools that needs to be one tap away, and what can live behind an "Insert" menu?
- If the Pages panel defaulted to collapsed below `sm`, would anything essential be lost — or would the canvas finally get the room it needs?
