# PR2: Form-Filling Core — Implementation Plan

**Goal:** Read AcroForm fields from an uploaded PDF and overlay fillable inputs;
author new fields; edit per-field properties in a modal; export a fresh,
fully-fillable PDF; fields round-trip (export → re-upload → re-detect).

**Builds on:** PR1 (merged). Reuses the `Tool` model, `FloatingToolbar`,
renderer/overlay registries, and `export-validate.ts`.

## Verified better-pdf API (already confirmed against installed types)

Reading (`doc.getForm().getFields()` → `FieldInfo[]`):

```ts
interface FieldWidget { page: number; rect: [x0, y0, x1, y1]; } // PDF points, origin bottom-left
interface FieldInfo {
  name: string;
  type: 'text'|'checkbox'|'radio'|'dropdown'|'listbox'|'signature'|'pushbutton'|'unknown';
  value: string | null;
  states: string[];     // checkbox/radio on-states
  options: string[];    // dropdown/listbox options
  readOnly: boolean; required: boolean; exported: boolean;
  maxLength: number | null; multiSelect: boolean;
  widgets: FieldWidget[];
}
```

Authoring (`doc.createForm()` → `FormBuilder`, only on a `create()`d doc — THROWS on a `load()`ed doc):

```ts
form.addTextField(name, { page, x, y, width, height, value?, maxLength?, multiline?, required?, readOnly?, tooltip?, border?, background? })
form.addCheckBox(name, { page, x, y, size, checked?, onValue?, ... })
form.addRadioGroup(name, { options: [{ value, page, x, y, size }], selected?, required?, readOnly?, tooltip? })
form.addDropdown(name, { page, x, y, width, height, options, selected?, ... })  // combo behavior
form.addListBox(name, { page, x, y, width, height, options, selected?, ... })
form.addSignatureField(name, { page, x, y, width, height, ... })
```

`FieldBorder = { color: Color; width?: number }`. Colors via `rgb(r,g,b)` (0..1).
All authoring coords use PDF convention: origin **bottom-left**.

Embedding: `doc.embedPdfPage(srcBytes, srcIndex): Promise<EmbeddedPdfPage>` then
`page.drawPage(embedded, DrawPageOptions)`. `EmbeddedPdfPage` has `width`/`height`.

## Risks — VERIFY FIRST (spike before building the export rebuild)

1. **embedPdfPage widget carryover.** Write a throwaway server test: load a PDF
   that has form fields, build a fresh doc, `embedPdfPage`+`drawPage` each page,
   `save()`, then re-`load()` and `getForm().getFields()`. CONFIRM the embedded
   page's content (text/graphics) is present but the source AcroForm widgets do
   NOT appear (count should be 0 before createForm adds ours). If widgets DO ride
   along, use the fallback in D3 (fill-in-place when zero authored fields).
2. **createForm on rebuilt doc with many fields across embedded pages** saves a
   valid, re-readable form. Confirm with a multi-field, multi-page spike.
3. **Signature-zone PNG placement** matches the field rect after Y-flip.

Put spikes in `src/lib/pdf/_spike.field.test.ts`, confirm findings, then DELETE
the spike file before finishing (or convert to a real round-trip test).

## Coordinate convention

Element `x`/`y` are top-left origin in PDF points (PR1 convention). A widget
`rect: [x0,y0,x1,y1]` (bottom-left origin) converts to a `FieldElement` as:

```
x = x0
y = pageHeight - y1          // top edge
width  = x1 - x0
height = y1 - y0
```

And back at authoring (bottom-left): `pdfY = pageHeight - y - height`.

Factor both directions into `src/lib/pdf/coords.ts` with unit tests
(`pdf↔css round-trip`). `pageHeight` comes from the detected page heights (the
extract query returns them) / from `EditorState.pages`.

## Data model — `src/lib/pdf/types.ts`

```ts
export type FieldKind =
  | 'text' | 'checkbox' | 'radio' | 'dropdown'
  | 'signature' | 'listbox' | 'combo';

export interface FieldElement {
  type: 'field';
  id: string;
  field: FieldKind;
  name: string;            // fully-qualified AcroForm name, unique in the doc
  x: number; y: number;    // top-left origin, PDF points
  width: number; height: number;
  page?: number;
  required?: boolean;
  readOnly?: boolean;
  tooltip?: string;
  border?: { color: { r: number; g: number; b: number }; width?: number };
  background?: { r: number; g: number; b: number };
  value?: string;          // current fill value (PNG dataURL for signature)
  options?: string[];      // dropdown/radio/listbox/combo
  placeholder?: string;    // text
  maxLength?: number;      // text
  multiline?: boolean;     // text
}
```

Add `FieldElement` to the `EditElement` union.

`combo` maps to `addDropdown` (combo = editable dropdown). `dropdown` also maps
to `addDropdown`. Keep both kinds distinct in the model so the UI can offer both;
both author via `addDropdown` (a plain dropdown is a non-editable combo). If the
lib distinguishes, prefer dropdown→addDropdown, combo→addDropdown (document the
choice in a comment).

## Tool model — `src/routes/editor/constants.ts`

```ts
export type FieldKind = ... // import from types instead of redeclaring
export type Tool =
  | { type: 'select' }
  | { type: 'draw'; kind: DrawKind }
  | { type: 'field'; kind: FieldKind };
```

`EditorState`: add `activeFieldKind = $derived(this.tool.type === 'field' ? this.tool.kind : null)`.
`placeAtClient`: when `tool.type === 'field'`, create a `FieldElement` (default
size per kind, auto-suggested unique name like `field1`, `checkbox2`, …), then
`resetTool()`. Add `selectedField = $derived(...)`.

## Field reading — `src/routes/editor/extractFields.remote.ts`

A `query` (`'unchecked'`) taking `{ bytes: Uint8Array }`, running
`PdfDocument.load(bytes).getForm().getFields()` server-side, mapping each field
(first widget) → `FieldElement` via `coords.ts`, returning
`{ fields: FieldElement[], pageHeights: number[] }`. Map `FieldInfo.type`:
`'text'|'checkbox'|'radio'|'dropdown'|'listbox'|'signature'` pass through;
`multiSelect` listbox stays `listbox`; `pushbutton'|'unknown'` → skip. Carry
`options`, `required`, `readOnly`, `maxLength`, `value`. On any error, return
`{ fields: [], pageHeights: [] }` (editor still opens for stamping).

Wire into `EditorState.loadPdf`: after `renderSourcePdf`, call the query with the
export-copy bytes, convert results to `FieldElement`s (they already are), and set
`this.elements = fields`. Errors are swallowed (friendly: no fields surfaced).

## Overlays — `src/routes/editor/overlays/FieldOverlay.svelte`

Interactive input per kind, positioned `x*SCALE,y*SCALE`, sized
`width*SCALE×height*SCALE`, bound to `el.value`:
- text → `<input>` (or `<textarea>` if multiline) with placeholder/maxLength.
- checkbox → `<input type=checkbox>` (value '' / onValue).
- radio → render the group's options as radios (MVP: single-widget radios ok).
- dropdown/combo → `<select>` (combo: also allow typing — MVP `<select>` ok).
- listbox → `<select multiple>`.
- signature → a drop zone showing the PNG dataURL if set; click opens the
  signature pad / image upload (reuse existing pending-raster flow; store PNG
  dataURL in `value`).
Selecting the overlay sets `editor.selectedId`; dragging moves it
(reuse `editor.startDrag`); resize via existing handle pattern where sensible.
Register `field: FieldOverlay` in `overlays/index.ts`.

## Field Properties modal — `src/routes/editor/FieldPropertiesModal.svelte`

Opened from `FloatingToolbar` (add a ⚙ Settings button when
`editor.selectedField`). Fields: name (unique-validated, inline error blocks
save), required, readOnly, border color+width, background color, tooltip;
type-specific: options list (add/remove/reorder) for dropdown/radio/listbox/combo;
placeholder/maxLength/multiline/default for text. Delete button. Bind to the
selected `FieldElement`. Duplicate-name validation against
`editor.elements.filter(e=>e.type==='field')`.

## Export rebuild (D3) — `src/lib/pdf/build.ts`

Replace `buildFromSource` (and unify blank mode) with a **rebuild** when there
are any `FieldElement`s OR a sourcePdf, per spec D3:

1. `doc = await PdfDocument.create()`.
2. For each output page (respecting `pageOps` order/blanks/rotation):
   - source page → `embedded = await doc.embedPdfPage(sourceBytes, srcIndex)`,
     `page = doc.addPage([embedded.width, embedded.height])`,
     `page.drawPage(embedded, { x:0, y:0, width, height })`. Apply rotation.
   - blank → `doc.addPage(size)`.
3. Stamp non-field elements (text/image/signature/shape) via the existing
   `renderElement` registry (UNCHANGED) onto their page.
4. Signature-zone `FieldElement`s holding a drawn PNG → `drawImage` at rect.
5. `form = doc.createForm()`; add EVERY `FieldElement` at its position with its
   current value (convert top-left → bottom-left). Skip signature fields already
   drawn as images, OR add `addSignatureField` (choose per spike #3; prefer real
   `addSignatureField` so it round-trips, and draw the PNG only if present).
6. `return doc.save()`.

Keep `PdfBuildError` handling. If spike #1 shows embedPdfPage carries widgets,
implement the documented fallback: when zero authored/zero-changed fields and a
sourcePdf is present, fill-in-place via `getForm()` + setters instead of rebuild.

`pageOps` restructure logic from PR1 can be reused conceptually but the rebuild
constructs pages fresh — fold the order/blank/rotation handling into step 2.

## Validation — `src/routes/editor/export-validate.ts`

Add `case 'field':` to `validateElement`: finite width/height; `field` in the
7 kinds; `name` non-empty string ≤ 256; `options` (if present) array of strings;
`maxLength`/border width finite if present; `value` string if present (cap
length, e.g. ≤ 2_000_000 for signature dataURLs). **Required** or new-element
exports 422.

## Tests (unit-first, both projects)

- `coords.test.ts`: pdf↔css round-trip.
- `editor.svelte.test.ts`: field tool creates one `FieldElement` then resets;
  unique-name autosuggest.
- `extractFields` mapping: given a known fixture form's `FieldInfo[]` (mock the
  lib call or use a real small fixture PDF), expect names/types/rects.
- `FieldPropertiesModal.svelte.test.ts`: sets name/options/required; rejects
  duplicate name (save blocked).
- `build.field.test.ts`: rebuild produces a fillable form; re-`load()` +
  `getFields()` round-trips names/types/values; listbox/combo author; appearance
  props (border/bg/tooltip/readOnly) survive export→re-detect.
- `export-validate.test.ts`: accepts a `field` element; rejects bad geometry.

## Gates (each must pass before commit)

`bun run check` (0 errors), `bun run test` (all pass), `bun run lint`,
`bun run build`. Use `bun`/`bunx`. Strict TS: conditional spread
(`...(x ? {k:v} : {})`) not `k: x ? v : undefined`. No `Map`/`Set` in reactive
state. Use `resolve()` for any nav. A `.remote.ts` may ONLY export remote
functions — keep pure helpers (validators, mappers) in plain `.ts` modules.

## Commit

One cohesive commit on branch `pr2-form-filling`:
`feat(editor): PR2 — read/author AcroForm fields, field properties, fillable export`
ending with the Co-Authored-By trailer used in PR1.
