# Design: Editor polish + PDF form-filling

Date: 2026-06-24
Status: Approved (pending written-spec review)

## Summary

Two shipments on the existing SvelteKit editor:

- **PR1 — editor polish:** a real home landing (Create / Edit), a redesigned
  editor header, an explicit tool model (Select is the default; create-tools
  gate page clicks), a Sejda-style floating contextual toolbar anchored to the
  selection, and two bug fixes (image placement on page ≥ 2; the shape/click
  text collision). Unit-test-first.
- **PR2 — form-filling:** read AcroForm fields from uploaded PDFs and overlay
  real fillable inputs; author new fields; edit field properties (name, options,
  required) in a modal; export a fresh, fully-fillable PDF via better-pdf. Fields
  round-trip losslessly (export → re-upload → still editable as fields).

Everything writes PDFs through `@ignaciano3/better-pdf` (dogfooding). pdf.js is
used only to rasterize pages for display. WASM stays server-only: field reading
and export run in SvelteKit remote functions, matching the existing
client-render / server-finalize split.

## Goals

- Editing an uploaded PDF surfaces its form **fields** as fillable inputs.
- Free-form stamping (text / image / shape / drawn signature) stays available on
  top of any document, including uploaded ones.
- Authoring new form fields, with per-field properties editable in a modal.
- Fields survive a full export → re-import round-trip.
- Unit/component tests simulating user input are the primary safety net; a thin
  Playwright smoke remains.

## Non-goals (future / desired)

- **Stamp round-trip.** Static text/image/shape are baked into page content on
  export and are not recoverable as editable elements on re-import. Making them
  round-trip needs an embedded edit-state sidecar, which the lib cannot store
  today (see Risks). Marked *desired*, not MVP.
- Flatten-on-download (ship interactive forms only in MVP; `flattenFields`
  exists for a fast follow).
- Multi-widget radio-group subtleties beyond basic single-group radios.
- OCR / compression / other paid heavy server ops.

## Architecture decisions

### D1 — Field reading runs server-side (Approach A)

A remote `query` runs better-pdf on the server: `doc.getForm().getFields()`
returns each field's `name`, `type`, `value`, `options`, `states`, `readOnly`,
`required`, and `widgets[]` (each widget carries `page` and
`rect: [x0,y0,x1,y1]` in PDF points). The client already rasterizes pages with
pdf.js; it overlays inputs positioned from those rects. This keeps WASM
server-only (no browser `initializeWasm`) and dogfoods better-pdf for reading.

Rejected: client-side WASM read (ships WASM, new init path, diverges from the
server-gated model); pdf.js annotation layer (messy export values, and we still
need better-pdf to write — double parse).

### D2 — Unified field model

Detected and authored fields are the same `FieldElement` on the canvas. There is
no separate "imported field" type; on upload, detected fields are converted to
`FieldElement`s and thereafter behave identically to authored ones.

### D3 — Export = rebuild (single path, server command, all better-pdf)

`createForm()` throws on a `PdfDocument.load()`ed document, so fields cannot be
added to an uploaded PDF in place. Instead every export builds a fresh document:

1. `PdfDocument.create()`.
2. Per output page: source page → `embedPdfPage(sourceBytes, srcIndex)` +
   `page.drawPage(...)` as the background; blank → `addPage(size)`. Page
   **content** embeds; AcroForm widget annotations do **not** ride along, so old
   widgets disappear cleanly and are re-authored in step 4.
3. Draw stamps (static text/image/shape/drawn-signature) via the existing
   renderer registry. Signature-zone fields holding a drawn PNG → `drawImage`.
4. `createForm()` → add **every** `FieldElement` at its position, with its
   current value as the initial value.
5. `save()` → a fresh, interactive, fully-fillable PDF.

Because fields are written as real AcroForm fields (not flattened), re-uploading
the exported file re-detects them (D1) → **fields round-trip** (D2 makes the
restored fields fully editable).

Risk-driven fallback: if `embedPdfPage` is found to carry old widgets (causing
doubling), fall back to fill-existing-in-place (`getForm()` + `fillFields`) when
there are zero authored fields, and only rebuild when authoring. Verified first
in the plan (see Risks).

## Components

### Routes / pages (PR1)

- `src/routes/+page.svelte` — landing. Hero + two CTAs: **Create new PDF** →
  `/editor`; **Edit existing PDF** → `/editor` showing an upload empty-state.
  Subtle freemium hint ("2 free exports/hour").
- `src/routes/editor/+page.svelte` — when no document is loaded, show a centered
  "Upload a PDF or start blank" empty-state instead of an immediate blank A4.

### Tool model (PR1)

- New `tool` state on `EditorState`: `'select' | 'text' | 'image' | 'signature'
  | 'line' | 'rectangle' | 'ellipse' | 'field-text' | 'field-checkbox' |
  'field-radio' | 'field-dropdown' | 'field-signature'`. Default `'select'`.
- Page click creates an element only when a create-tool is active; `'select'`
  never creates. This removes click-to-add-text (kills the "lottery") and the
  trailing-click-after-shape-draw text collision in one change.
- After creating, the tool returns to `'select'` (one-shot), matching today's
  shape behavior.

### Header (PR1)

`Toolbar.svelte` becomes a clean three-zone app bar:

- **Left — File:** Upload PDF · New blank · (filename + page count when loaded).
- **Center — Insert:** segmented control `Select · Text · Image · Signature ·
  Line · Rect · Ellipse · Field ▾`, active-state highlighted.
- **Right:** Export PDF (primary).

Per-selection controls leave the header (see floating toolbar).

### Floating contextual toolbar (PR1)

A component anchored just above the selected element, following it on
move/scroll. Contents adapt to element type:

- Static text: font size, text color, align, duplicate, delete.
- Shape: stroke color, fill toggle/color, stroke width, duplicate, delete.
- Image / drawn-signature: duplicate, delete (resize via existing handles).
- Field: **⚙ Settings** (opens Field Properties modal), duplicate, delete.

### Field Properties modal (PR2)

Opened from the floating toolbar's ⚙ (or on creating a field). Fields:

- `name` — auto-suggested, must be unique within the document.
- `required` — toggle.
- Type-specific: dropdown/radio → options list (add / remove / reorder); text →
  placeholder, max length, multiline toggle.
- Delete button.

Detected AcroForm fields open the same modal with their read values.

### Data model (PR2)

Extend `src/lib/pdf/types.ts`:

```ts
type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature';

interface FieldElementBase {
  type: 'field';
  id: string;
  field: FieldKind;
  name: string;          // fully-qualified AcroForm name, unique
  x: number; y: number;  // top-left origin, PDF points
  width: number; height: number;
  page?: number;
  required?: boolean;
  value?: string;        // current fill value (PNG dataURL for signature)
}
// + per-kind extras: text { placeholder?, maxLength?, multiline? },
//   dropdown/radio { options: string[] }
```

`EditElement` gains the `'field'` variant. The renderer registry and overlay
registry gain a `field` entry. The export validator (`export.remote.ts`
`validateElement`) gains a `'field'` case — **required** so field exports don't
422 (see memory: export-gate-validation lesson).

### Server remote functions (PR2)

- `extractFields.remote.ts` — `query` over uploaded bytes →
  `{ fields: FieldElement[], pageHeights: number[] }` using better-pdf
  `getForm().getFields()` and the widget rects (PDF→top-left conversion shared
  with the existing builder).
- `export.remote.ts` — extend the existing `command` to the rebuild flow (D3);
  add the `'field'` validation case.

### Coordinate conversion

PDF rect (origin bottom-left) ↔ top-left canvas points, factored into a small
shared module reused by detection, overlays, and export (mirrors the reference's
`coords.ts`).

## Data flow

1. **Upload** → pdf.js rasterizes pages for display (existing) **and**
   `extractFields` query returns field elements + page heights.
2. Detected fields become `FieldElement`s; overlays render real inputs bound to
   each field's `value`. Authoring tools add more `FieldElement`s.
3. Free-form stamping continues to add static elements via existing tools.
4. **Export** → `exportPdf` command runs the rebuild (D3) → interactive PDF.
5. **Re-upload exported** → step 1 re-detects fields → fields editable again.

## Error handling

- Field extraction failure (corrupt/encrypted/XFA) → friendly message; editor
  still opens for stamping (no fields surfaced). Reuse `PdfRenderError`-style
  messaging.
- Export failures keep the existing `PdfBuildError` → 422 seam and the
  429 → upsell seam.
- Duplicate field name in the modal → inline validation error, save blocked.
- Oversized payloads keep the existing byte/element caps; add a field-count cap.

## Testing (unit-first)

Vitest component/unit tests simulating user input:

- Select tool does not create on click; Text tool creates exactly one text box.
- **Place image on page 2** (regression that drove this work) → then fix.
- Drawing a shape leaves no stray text element.
- Field Properties modal: sets name/options/required; rejects duplicate names.
- `pdf↔css` coordinate round-trip.
- `extractFields` returns expected names/types/rects for a known fixture form.
- Export rebuild produces a fillable form; re-detect round-trips field
  names/types/values.
- `validateElement` accepts `'field'` elements (gate regression guard).

Playwright: keep a single thin smoke (upload → fill a field → export; rate-limit
→ upsell). No broad e2e expansion.

## Risks / verify first

1. **`embedPdfPage` annotation behavior** — confirm it preserves page text/visuals
   but does NOT carry source AcroForm widgets. If it does carry them, use the
   fill-in-place fallback (D3). This is the first task in the plan.
2. **`createForm` on rebuilt docs** — confirm adding many fields across multiple
   embedded pages saves a valid, re-readable form.
3. **Signature-zone stamping** — confirm drawn-PNG placement matches the field
   rect after Y-flip.

## Sequencing

- **PR1** (polish + fixes + tool model + floating toolbar) ships first and is
  independent of better-pdf form APIs.
- **PR2** (form-filling) builds on PR1's tool model and floating toolbar.
