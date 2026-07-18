# Text markup (highlight / underline / strikethrough) — design

**Date:** 2026-07-17
**Status:** Implemented v1 (2026-07-18) — manual drag-region markup; text-snapping still v2
**Library:** `@ignaciano3/better-pdf` (draw primitives already in use)

## Problem

Sejda offers highlight, underline, and strikethrough over existing text. We have
shapes and freehand draw, but no text-oriented markup. This is baseline-expected
in any PDF editor and is pure client-side work.

## Key constraint: no text layer exists

The app never extracts body text with coordinates. `render.ts` rasterizes pages
to PNG data URLs via pdf.js `page.render(...)`; it never calls
`page.getTextContent()`. There is **no per-word/per-glyph geometry** available
client-side today (confirmed: zero `getTextContent` usages in `src/`).

True Sejda-style behavior — click a word, markup snaps to its bounding box —
would require building a text layer (pdf.js `getTextContent()` → `TextItem[]`
with `transform`/`width`, a selection model, coordinate mapping across zoom,
multi-line and RTL handling). That is a large, separate effort.

**Decision: ship manual drag-region markup first (v1).** User drags a rectangle
over the text they want marked; we draw the markup in that region. No snapping,
no text extraction. This reuses the existing shape-draw pipeline almost whole and
delivers ~80% of the value. Text-snapping is a documented v2 (see below).

## Element model — `src/lib/pdf/types.ts`

Add one discriminated-union member, mirroring `ShapeElement`'s sub-kind pattern:

```ts
export type MarkupKind = 'highlight' | 'underline' | 'strikethrough';

export interface MarkupElement {
  type: 'markup';
  id: string;
  page?: number;
  x: number; y: number; width: number; height: number; // PDF points, top-left origin
  markup: MarkupKind;
  color: { r: number; g: number; b: number };           // 0..1
  opacity?: number;                                      // highlight only; default 0.4
  thickness?: number;                                    // underline/strikethrough line width, pt; default 1.5
}
```

Add `| MarkupElement` to the `EditElement` union (types.ts ~669-678).

Rendering geometry (all in the renderer, from the top-left box):
- **highlight** → filled rectangle covering the whole box, semi-transparent.
- **underline** → horizontal line at the box **bottom** edge.
- **strikethrough** → horizontal line at the box **vertical center**.

## Plumbing (five plug points, per the additive-element pattern)

### 1. Tool identity — `src/routes/editor/constants.ts`
Extend `DrawKind` (~51-60) with `'highlight' | 'underline' | 'strikethrough'`.
Add shortcuts to `DRAW_SHORTCUTS` (suggest `H`, `U`, `K` — avoid existing T/S/etc).

### 2. Toolbar — new `AnnotateSection.svelte` (or extend `ContentSection.svelte`)
Data-driven button list `{ kind: DrawKind; label }[]` exactly like
`ShapesSection.svelte` (lines 16-28), calling
`editor.setTool({ type:'draw', kind })` / `editor.resetTool()`. Reuse
`sectionLabel/sectionGroup/toolClass` from `./styles`.

### 3. Store — `src/routes/editor/editor.svelte.ts`
Add `beginMarkupDraw(event, pageEl, pageIndex)` cloning `beginShapeDraw`
(994-1033): snapshot the active markup kind + current color/opacity, create a
zero-size `MarkupElement` via `this.add(...)`, resize its bbox on drag through the
shared `#beginDraw` generic (954-986), enforce `SHAPE_MIN_SIZE`, `resetTool()` on
commit. `Canvas.svelte` (`onPagePointerDown`, ~47-58) calls it in the same
try-each-begin chain as the other draw tools.

Defaults on create: highlight `color {1,1,0}`, `opacity 0.4`; underline/
strikethrough `color {0,0,0}` (or the last-used markup color), `thickness 1.5`.

### 4. Overlay — `src/routes/editor/overlays/MarkupOverlay.svelte` + registry
Clone `ShapeOverlay.svelte`: absolute div at `x*SCALE`/`y*SCALE` (SCALE 0.8),
inner `<svg>` drawing the highlight rect or the underline/strikethrough line,
selection highlight on `editor.selectedId === el.id`, `onpointerdown` →
`editor.startDrag`, resize handle → `editor.startResize`. Add the
`markup: MarkupOverlay` entry to `overlays/index.ts` (~19-32).

### 5. Renderer — `src/lib/pdf/renderers/markup.ts` + registry
`ElementRenderer<MarkupElement>`. Compute `bottom = pageHeight - y - height`.
- highlight: `page.drawRectangle({ x, y: bottom, width, height, fill: rgb(...), opacity })`
- underline: `page.drawLine({ start:{x, y:bottom}, end:{x:x+width, y:bottom}, stroke: rgb(...), strokeWidth: thickness })`
- strikethrough: same line at `y: bottom + height/2`.

Register in `renderers/index.ts` (~26-34). No `export-plan.ts` change — non-field
stamp elements ride the existing element loop in both `stampAndAuthor` and
`buildIncremental`.

**⚠ Opacity gap:** `renderers/shape.ts` does not currently pass `opacity` to
`drawRectangle`. The primitive accepts it (path/polygon renderers pass it). The
markup renderer must pass `opacity` explicitly for the highlight fill.

### 6. Property editing — `FloatingToolbar.svelte`
Add a `case 'markup'` (alongside the existing `selected.type` switch, ~138-186):
color swatch for all three; opacity slider for highlight; thickness for
underline/strikethrough.

### 7. Export validation — `src/routes/editor/export-validate.ts`

**Not optional.** The export path validates every element by `type` in a
`switch`, and the `default` branch throws `422 Unknown element type`. A new
element type MUST add a `case 'markup'` (geometry + `markup` kind in
`['highlight','underline','strikethrough']` + finite `opacity`/`thickness`) or
every export containing markup 422s. (This plug point was missed in the first
draft and only surfaced by driving the real export — added here so future
element types don't repeat it.)

## v2 (future, out of scope here): text-snapping

Add `getSourceTextLayer(bytes)` beside `renderSourcePdf` in `render.ts` using
pdf.js `page.getTextContent()`, cache `TextItem[]` boxes per page, and snap the
dragged region to overlapping word/line boxes. Multi-line highlight would emit
one `MarkupElement` per covered line. Deferred — v1 does not build this.

## Testing

- Renderer unit tests (Vitest, matching `renderers/*` style): each markup kind
  produces the expected draw call at the correct flipped-Y coordinate.
- Highlight passes `opacity`; underline sits at box bottom; strikethrough at mid.
- Round-trip: create → export → element present; export-plan still selects the
  correct path (unchanged, since markup is a non-field stamp).

## Out of scope

- Text-anchored snapping / text selection (v2).
- Multiply/blend-mode highlights (PDF blend modes not exposed; semi-transparent
  fill only).
- Redaction — see the whiteout/redaction spec; markup never removes content.
