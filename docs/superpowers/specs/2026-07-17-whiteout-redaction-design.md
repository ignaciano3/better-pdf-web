# Whiteout / redaction — design

**Date:** 2026-07-17
**Status:** v1 (whiteout cover) implemented 2026-07-18; v2 secure redaction still deferred
**Library:** `@ignaciano3/better-pdf` (no redaction API; `drawRectangle` used)

## Problem

Sejda has a "whiteout" tool (cover content with a filled rectangle) and,
separately, true redaction. We have only additive shapes. Users expect a
one-click way to cover mistakes or hide content.

## ⚠ Security warning — whiteout is NOT redaction

**A white rectangle drawn over text does not remove the underlying text.** The
original glyphs/images stay in the PDF content stream and are trivially
recoverable (copy-paste, text extraction, "remove object"). Anyone who whites out
an SSN and ships the file has leaked it.

This spec ships two clearly-separated capabilities so we never mislead a user:

1. **Whiteout (cover)** — v1, cheap. A filled rectangle. Labeled honestly as
   *cover only*, with UI copy stating it does not remove hidden data.
2. **Secure redaction** — v2, heavier. Actually destroys the covered content by
   rasterizing the affected page. Marked as the real "redact" action.

We must never label the cheap cover tool "Redact".

## v1 — Whiteout (cover)

### Model — reuse `ShapeElement`, no new type

A whiteout is a rectangle with `fillColor` set and **no stroke**
(`strokeColor` undefined). `ShapeElement` (types.ts ~332-369) already supports
`shape:'rectangle'`, optional `fillColor`, optional `strokeColor`. No new element
type, overlay, or renderer is needed — the existing shape pipeline draws it.

### Plumbing (thin — one tool, one store method)

- **`constants.ts`:** add `'whiteout'` to `DrawKind` (~51-60); shortcut e.g. `W`.
- **Toolbar:** one button in `AnnotateSection`/`ShapesSection` →
  `editor.setTool({ type:'draw', kind:'whiteout' })`.
- **Store `editor.svelte.ts`:** `beginWhiteoutDraw(...)` = `beginShapeDraw`
  (994-1033) with a preset snapshot: `shape:'rectangle'`, `fillColor` = current
  whiteout color (**default white `{1,1,1}`**), `strokeColor: undefined`,
  `strokeWidth: 0`, `opacity: 1`. `Canvas.svelte` calls it in the begin chain.
- **Overlay/renderer:** none new — `ShapeOverlay` + `renderers/shape.ts` handle a
  filled, strokeless rectangle already. The overlay renders it opaque-filled so
  it reads as whiteout on-canvas.
- **`FloatingToolbar.svelte`:** whiteout selection reuses the shape `fillColor`
  editor (a color picker — user can match a non-white page background, e.g. an
  off-white scan). No stroke controls.

### UI copy (required)
Tool tooltip and/or an inline note: *"Whiteout covers content visually but does
not remove the hidden text/image underneath. For permanent removal use Redact."*

## v2 — Secure redaction (future, heavier)

The library has **no redaction primitive** (confirmed: only draw/embed APIs).
The only reliable client-side way to actually destroy covered content is to
**rasterize the affected page and replace it with a flattened image**:

1. User marks redaction regions (a distinct `RedactionElement`, or a flag on the
   marks) on one or more pages.
2. On export, for each page carrying redactions:
   - Render the page to a canvas via pdf.js (`render.ts` already does this).
   - Paint solid black boxes over the marked regions on the canvas.
   - Embed the canvas PNG as a full-page image (`doc.embedPng` + `page.drawImage`),
     replacing the page's original content stream so no source text survives.
3. Result: those pages become images — no selectable/extractable text remains
   under the redaction (the whole page loses its text layer; acceptable and
   standard for redaction).

Positioning: gate this as a **heavy op** consistent with the pricing page's
"heavy ops as they ship" language; it is the honest, secure counterpart to v1.
Full design deferred to its own spec — only scoped here to keep v1 labeling
correct.

## Testing (v1)

- Whiteout tool emits a `ShapeElement` `rectangle` with `fillColor` set,
  `strokeColor` undefined, `opacity 1`.
- Renders as an opaque filled rect at the correct flipped-Y coordinate.
- Default color is white; color picker changes fill.
- Regression: export-plan unchanged (whiteout is a non-field stamp).

## Out of scope

- v2 secure redaction implementation (separate spec).
- Auto-detecting sensitive content (PII scan).
- Pattern/redaction-reason overlays ("[REDACTED]" labels).
