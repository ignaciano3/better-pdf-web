# Flatten-on-export + Watermark — Design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)

Two independent features that wire existing `@ignaciano3/better-pdf` (≥1.1)
capabilities into better-pdf-web. They share the export pipeline
(`editor.svelte.ts` → `export.remote.ts` → `validateExportInput` → `buildPdf`)
but are otherwise separate vertical slices and can be built/tested separately.

---

## Feature A — Flatten-on-export (global toggle)

Let the user export a **flattened** (print-ready, non-editable) PDF where every
authored AcroForm field is baked into page content instead of staying
interactive.

### Why a second pass
Authored fields are built with `FormBuilder` (`doc.createForm()`), which has no
flatten method. `flatten()` lives on `PdfForm`, obtained from a **loaded**
document via `doc.getForm()` (confirmed in `core/document.d.ts:191` and
`forms/form.d.ts:233`). So flattening is a post-process pass over the already
-built interactive bytes.

### Model
`EditState.flatten?: boolean` (in `src/lib/pdf/types.ts`).

### Build (`src/lib/pdf/build.ts`)
- New isolated, independently-testable helper:
  ```ts
  async function flattenAllFields(bytes: Uint8Array): Promise<Uint8Array> {
    const doc = await PdfDocument.load(bytes);
    const form = doc.getForm();
    form.flatten();
    return await doc.save();
  }
  ```
- In `buildPdf`, after the existing build returns interactive bytes: if
  `state.flatten` is true **and** the document has at least one field element,
  return `flattenAllFields(bytes)`; otherwise return bytes unchanged. (No fields
  ⇒ flatten is a no-op, skip the extra load/save.)

### Validator (`src/routes/editor/export-validate.ts`)
Accept optional `flatten`; reject non-boolean. It is a plain flag so the only
check is the type.

### Editor + UI
- `EditorState.flatten = $state(false)` (`editor.svelte.ts`); include
  `...(this.flatten ? { flatten: true } : {})` in the exported `state` object.
- Surface the toggle **inside the Document properties modal**
  (`DocumentPropertiesModal.svelte`), as a checkbox:
  *"Flatten fields on export (print-ready, non-editable)"*. It is a document
  -level export option, so it lives with the other document properties rather
  than next to the Export button.

### Edge cases
- Signature fields are already drawn as a PNG plus an interactive widget;
  flattening bakes the widget appearance, the drawn PNG is unaffected.
- Flatten + re-upload: a flattened export has no AcroForm, so re-uploading it
  detects no fields (expected — it is no longer a form).

---

## Feature B — Watermark (text only, single centered, rotated, all pages)

Stamp a single **text** watermark (e.g. "DRAFT") centered and rotated on
**every** output page, with adjustable opacity.

> **v1 is text-only.** The lib's `drawImage` / `DrawImageOptions` exposes only
> `{ x, y, width?, height? }` — no `opacity` and no `rotate` — so an image
> watermark could neither be faded nor rotated. Only `drawText` supports both.
> Image watermark is deferred until the lib adds image opacity/rotate (recorded
> as a better-pdf feature request).

### Model (`src/lib/pdf/types.ts`)
```ts
export interface Watermark {
  text: string;
  font?: StandardFontName;     // default Helvetica-Bold
  size?: number;               // pt, default 48
  color?: { r: number; g: number; b: number }; // default mid-gray
  opacity?: number;            // 0..1, default 0.3
  rotation?: number;           // degrees, default 45
}
```
Added to `EditState.watermark?: Watermark`. **v1 applies to all pages** — no
per-page range yet (noted as a future extension).

### Build (`src/lib/pdf/build.ts`)
- New `drawWatermark(doc, pageWidths, pageHeights, wm)` called once after
  `stampAndAuthor`, iterating every output page.
- Measure the string at `size` with the chosen standard font via
  `doc.getFont(name).widthOfTextAtSize(text, size)`, center on the page
  (`x = (pageWidth - textWidth) / 2`, `y = pageHeight / 2`), draw with
  `page.drawText(text, { x, y, size, font, color, opacity, rotate })`.
- Drawn **on top** of page content with low opacity: source pages are embedded
  as full-page content (`drawPage`), so a "behind" layer would be hidden.
- Note: `pageWidths` must be threaded alongside the existing `pageHeights`
  (today `stampAndAuthor` only tracks heights for the Y-flip).

### Validator (`src/routes/editor/export-validate.ts`)
Validate `watermark` when present: `text` is a non-empty string within
`MAX_TEXT_LEN`; `font` ∈ standard-font set (when present); `color` is a valid
RGB triple (when present); `opacity` ∈ [0,1]; `rotation`/`size` finite (when
present). Reject unknown shapes (security boundary).

### Editor + UI
- `EditorState.watermark = $state<Watermark | null>(null)` and
  `watermarkModalOpen = $state(false)` (`editor.svelte.ts`); include
  `...(this.watermark ? { watermark: $state.snapshot(this.watermark) } : {})`
  in the exported `state`.
- A **Watermark** tool button in the content toolbar
  (`toolbar/ContentSection.svelte`) opens a new `WatermarkModal.svelte`: text
  string, font, size, color, opacity slider, rotation input, and an
  enable/remove action (sets `watermark` to a default or `null`).
- A non-interactive `overlays/WatermarkOverlay.svelte` renders the watermark
  text centered + rotated + semi-transparent on every page in the canvas, so the
  user sees it before export (mirrors the build output).

### Edge cases
- No watermark configured (`watermark` null) ⇒ omitted from `state`, build
  unchanged.
- Empty/whitespace `text` ⇒ treated as no watermark (omitted from `state`).

---

## Out of scope (future)
- **Image watermark** — blocked on the lib gaining `drawImage` opacity/rotate.
- Per-page / page-range watermark targeting.
- Tiled / repeated watermark layout.
- Free-position (draggable) watermark.
- Per-field flatten selection (only global flatten in v1).
- N-up page tiling.

## Testing
- **Flatten:** unit-test `flattenAllFields` round-trips (build interactive →
  flatten → re-load → assert no AcroForm fields); `buildPdf` no-ops flatten when
  no fields. Validator accepts boolean, rejects non-boolean.
- **Watermark:** `buildPdf` with a watermark produces a larger/changed content
  stream on every page (smoke); validator accepts a valid watermark, rejects
  oversized/empty text and bad font/color/opacity. Component test that
  `WatermarkModal` edits state and the toggle in `DocumentPropertiesModal` flips
  `flatten`.
