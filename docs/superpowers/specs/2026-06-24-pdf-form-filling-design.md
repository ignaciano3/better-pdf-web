# Design: Editor polish + PDF form-filling

Date: 2026-06-24
Status: Approved (pending written-spec review)

## Summary

Four shipments on the existing SvelteKit editor. A deliberate secondary goal is
**broad coverage of the `@ignaciano3/better-pdf` API** (dogfooding) — see the
Feature scope table below for which lib calls each feature exercises.

- **PR1 — editor polish + rich text:** home landing (Create / Edit), redesigned
  header, explicit tool model (Select default; create-tools gate page clicks;
  **drawing tools and field tools are separate groups**), Sejda-style floating
  contextual toolbar, rich static-text properties (font, bold/italic, color,
  opacity, rotation, line-height, word-wrap), and two bug fixes (image on
  page ≥ 2; the shape/click text collision).
- **PR2 — form-filling core:** read AcroForm fields and overlay fillable inputs;
  author new fields; field properties (name, options, required, **border /
  background / tooltip / read-only / max-length / multiline / default**) in a
  modal; field types text / checkbox / radio / dropdown / signature /
  **listbox / combo**; export a fresh fully-fillable PDF. Fields round-trip.
- **PR3 — vector & content richness:** freehand / SVG-path & polygon tools,
  hyperlink elements (external URL or internal go-to-page), custom font
  upload/embed for static text.
- **PR4 — canvas & document controls:** zoom + fit-to-width, change page sizes,
  merge/append a second uploaded PDF, document properties (metadata), and an
  outline/bookmarks editor.

## Feature scope (lib coverage)

| Feature                     | PR  | better-pdf calls exercised                                                   |
| --------------------------- | --- | ---------------------------------------------------------------------------- |
| Rich static text            | 1   | `drawText` font/color/opacity/rotate/lineHeight/maxWidth; `StandardFonts`    |
| Form field read             | 2   | `getForm().getFields()`, widget `rect`/`page`                                |
| Form field authoring        | 2   | `createForm()` → `FormBuilder`                                               |
| Field types (listbox/combo) | 2   | `ChoiceOptions.combo`, `PdfListBox.selectMultiple`                           |
| Field properties            | 2   | `FieldBorder`, `background`, `tooltip`, `readOnly`, `maxLength`, `multiline` |
| Fill + export rebuild       | 2   | `embedPdfPage`/`drawPage`, `createForm`, `PdfSignature.setImage`             |
| Freehand / polygon          | 3   | `drawSvgPath`, `drawPolygon`                                                 |
| Hyperlinks                  | 3   | `drawLink` (`url` / `goToPage`)                                              |
| Custom font embed           | 3   | `embedFont(bytes)`, `PdfFont`                                                |
| Zoom / page size            | 4   | canvas zoom; `setSize` / `setMediaBox` on export                             |
| Merge PDFs                  | 4   | `embedPdfPage` from a second source                                          |
| Document properties         | 4   | `setTitle`/`setAuthor`/`setSubject`/`setKeywords`/`setCreator`               |
| Outline / bookmarks         | 4   | `setOutline(OutlineItem[])`                                                  |

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
- **Broad better-pdf coverage** as a deliberate dogfooding goal — exercise text
  styling, custom fonts, vector paths, links, all field types + properties,
  merge, metadata, and outline (see Feature scope table).
- Unit/component tests simulating user input are the primary safety net; a thin
  Playwright smoke remains.

## Non-goals (future / desired)

- **Stamp round-trip.** Static text/image/shape are baked into page content on
  export and are not recoverable as editable elements on re-import. Making them
  round-trip needs an embedded edit-state sidecar, which the lib cannot store
  today (see Risks). Marked _desired_, not MVP.
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

- New `tool` state on `EditorState`, grouped into two distinct categories that
  the UI also keeps visually separate:
  - **Drawings (stamps):** `'text' | 'image' | 'signature' | 'line' |
'rectangle' | 'ellipse'` (PR1) + `'path' | 'polygon' | 'link'` (PR3).
  - **Form fields:** `'field-text' | 'field-checkbox' | 'field-radio' |
'field-dropdown' | 'field-signature' | 'field-listbox' | 'field-combo'`.
  - Plus the default `'select'`.
- Modeled so the two categories never blur: e.g.
  `type Tool = 'select' | { group: 'draw'; kind: DrawKind } | { group: 'field';
kind: FieldKind }` (or an equivalent tagged enum) — drawings produce static
  stamp elements, fields produce `FieldElement`s. (Form-field tools are wired in
  PR2; PR1 ships the grouping and the drawing tools.)
- Page click creates an element only when a create-tool is active; `'select'`
  never creates. This removes click-to-add-text (kills the "lottery") and the
  trailing-click-after-shape-draw text collision in one change.
- After creating, the tool returns to `'select'` (one-shot), matching today's
  shape behavior.

### Header (PR1)

`Toolbar.svelte` becomes a clean three-zone app bar:

- **Left — File:** Upload PDF · New blank · (filename + page count when loaded).
- **Center — Insert:** two visually separated groups, active-state highlighted —
  **Drawings** (`Select · Text · Image · Signature · Line · Rect · Ellipse`) and
  **Form fields** (`Field ▾`: Text / Checkbox / Radio / Dropdown / Signature).
- **Right:** Export PDF (primary).

Per-selection controls leave the header (see floating toolbar).

### Floating contextual toolbar (PR1)

A component anchored just above the selected element, following it on
move/scroll. Contents adapt to element type:

- Static text: font family, bold/italic, size, color, opacity, rotation,
  line-height, word-wrap (maxWidth), align, duplicate, delete (PR1; custom-font
  picker entry added in PR3).
- Shape: stroke color, fill toggle/color, stroke width, opacity, duplicate,
  delete.
- Path / polygon (PR3): stroke/fill/width/opacity, duplicate, delete.
- Link (PR3): edit target (URL / page), duplicate, delete.
- Image / drawn-signature: duplicate, delete (resize via existing handles).
- Field: **⚙ Settings** (opens Field Properties modal), duplicate, delete.

### Field Properties modal (PR2)

Opened from the floating toolbar's ⚙ (or on creating a field). Fields:

- `name` — auto-suggested, must be unique within the document.
- `required` / `readOnly` — toggles.
- Appearance: border color + width, background color, tooltip.
- Type-specific: dropdown/radio/listbox/combo → options list (add / remove /
  reorder); text → placeholder, max length, multiline toggle, default value.
- Delete button.

Detected AcroForm fields open the same modal with their read values.

### Data model (PR2–PR3)

Extend `src/lib/pdf/types.ts`:

```ts
type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'listbox' | 'combo';

interface FieldElementBase {
	type: 'field';
	id: string;
	field: FieldKind;
	name: string; // fully-qualified AcroForm name, unique
	x: number;
	y: number; // top-left origin, PDF points
	width: number;
	height: number;
	page?: number;
	required?: boolean;
	readOnly?: boolean;
	tooltip?: string;
	border?: { color: { r: number; g: number; b: number }; width?: number };
	background?: { r: number; g: number; b: number };
	value?: string; // current fill value (PNG dataURL for signature)
}
// + per-kind extras: text { placeholder?, maxLength?, multiline? },
//   dropdown/radio/listbox/combo { options: string[] }
```

`TextElement` (static text) also gains rich props in **PR1**: `font?` (a
`StandardFonts` value or embedded `fontId`), `color?`, `opacity?`, `rotation?`,
`lineHeight?`, `maxWidth?` (word-wrap). **PR3** adds `PathElement`
(`d: string` SVG path), `PolygonElement` (`points[]`, `closed`), and
`LinkElement` (`url?` | `goToPage?`).

`EditElement` gains the `'field'` variant (PR2) and `'path' | 'polygon' |
'link'` (PR3). The renderer registry and overlay registry gain an entry per new
type. The export validator (`export.remote.ts` `validateElement`) gains a case
per new type — **required** so new-element exports don't 422 (see memory:
export-gate-validation lesson).

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
- `validateElement` accepts every new element type (gate regression guard) —
  `'field'`, `'path'`, `'polygon'`, `'link'`.
- Rich text: drawText receives the chosen font/color/opacity/rotation/wrap (PR1).
- Listbox/combo author + round-trip; field appearance props (border/bg/tooltip/
  readOnly) survive export→re-detect (PR2).
- Custom font embed: an embedded font is used and re-rendered (PR3).
- Merge: appending a second PDF yields the combined page count (PR4).
- Document properties + outline written and re-readable (PR4).

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
4. **`embedFont`** — confirm an uploaded TTF/OTF embeds and renders (subsetting
   path); fall back to standard fonts on failure (PR3).
5. **Merge via `embedPdfPage`** — confirm appending a second document's pages
   composes correctly with the rebuild export (PR4).

## Sequencing

- **PR1** (polish + fixes + tool model + floating toolbar + rich text) ships
  first and is independent of better-pdf form APIs.
- **PR2** (form-filling core, incl. listbox/combo + field appearance props)
  builds on PR1's tool model and floating toolbar.
- **PR3** (vector/path/polygon, hyperlinks, custom font embed) extends PR1's
  drawing tools and PR2's element/registry plumbing.
- **PR4** (canvas & document controls: zoom + fit-to-width, change page sizes,
  merge/append PDFs, document properties, outline/bookmarks). Largest UI surface;
  ships last. May get its own sub-spec when reached.

Each PR is independently shippable; later PRs only add element types/registry
entries and validator cases, never rewrite earlier ones.
