# Incremental export — preserve the original PDF

**Date:** 2026-07-08
**Status:** Approved design, pending implementation plan
**Library:** `@ignaciano3/better-pdf` 1.12.0 (createForm-on-load landed in 1.9.0)

## Problem

Export today is always a full rebuild (`buildSourceRebuild` in
`src/lib/pdf/build.ts`): a fresh document is created, source pages are embedded
as background Form XObjects, and every field is re-authored. This was forced by
the old library, where `createForm()` threw on a `load()`ed document. The
rebuild has two costs:

1. The original PDF's internals are discarded — its existing AcroForm fields
   silently disappear from the output (`embedPdfPage` carries page content
   only), and any digital signatures are destroyed.
2. Every export regenerates the entire file instead of appending the user's
   changes.

Since better-pdf 1.9.0, `createForm()` works on loaded documents and saves are
append-only incremental updates. The loaded-document path also supports every
mutation the editor needs: `drawText`/`drawImage`/vector drawing, page ops
(`setRotation`, `setSize`, `insertPage`, `removePage`, `movePage`),
`embedPdfPage` + `drawPage` (watermarks), metadata, outlines, and
`getForm().flatten()`.

## Decision summary

- **Default export path becomes incremental**: load the source, mutate it in
  place, save append-only. Original bytes, pre-existing form fields, and
  signatures on prior revisions are preserved.
- **The "Optimize file size" toggle is renamed to "Compact PDF structure"** and
  becomes the explicit opt-in to the old full-rebuild path (where
  `objectStreams` actually applies). Its help text is honest about the small
  gain and the trade-off (rebuild drops the original PDF's interactive fields;
  output is PDF 1.5+).
- **Field-name collisions** (new field vs a field already present in the source
  PDF) are validated in the editor at naming time, never at export.
- **Multi-source** documents are assembled first (`PdfDocument.assemble` with
  the output page selection), then the assembled document is loaded and mutated
  incrementally like the single-source case.

## Export dispatch (`src/lib/pdf/build.ts`)

`buildPdf(state)` dispatches:

| Condition | Path |
|---|---|
| Compact toggle ON (`state.objectStreams`) | Current full rebuild, unchanged |
| A source-extracted field was structurally changed or deleted | Full rebuild (fallback) |
| Any selected source page carries non-zero intrinsic `/Rotate` | Full rebuild (conservative fallback) |
| Any page op carries a rotation or size override | Full rebuild (conservative v1 — coordinate conventions differ on loaded pages) |
| No source | Current `create()` blank path, unchanged |
| Single source, toggle OFF | **New incremental path** |
| Multiple sources, toggle OFF | **Assemble, then incremental path** |

### Incremental path, single source

1. `PdfDocument.load(sourceBytes)`.
2. Page structure: selection/reorder/removal/duplication is expressed via
   `assemble` (skipped when the page ops are the identity over source 0);
   blank pages via `insertPage`. Rotation and resize ops fall back to the
   rebuild in v1 (coordinate conventions on loaded pages differ from the
   rebuild's fresh pages; revisit with dedicated tests).
3. Draw stamps (text/images/vector) and the watermark on the loaded pages using
   the existing renderer registry. Coordinates convert with the same
   `topLeftToPdfY` logic, using each loaded page's actual height.
4. `doc.createForm()` and re-use the existing `authorField()` per FieldElement.
   All fields are added **before** the first `getForm()` call (1.9.0 contract:
   fields inject on first `getForm()`/`save()`).
5. Metadata and outline via the existing `applyMetadata`/`setOutline` code.
6. If flatten requested: `doc.getForm().flatten()` (also flattens the source's
   pre-existing fields — same semantics a user expects from "flatten").
7. `doc.save()` — append-only. `objectStreams` is never passed here (the
   library ignores it on incremental saves anyway).

### Multiple sources: assemble, then incremental

Any output page order — including interleaving pages across sources — is
handled by assembling first:

1. `PdfDocument.assemble(sources, selections)` where `selections` is the
   output page order as `{ docIndex, pageIndex }` entries derived from
   `state.pageOps`. Page removal and reordering are expressed by the selection
   itself (no `removePage`/`movePage` needed afterwards).
2. `PdfDocument.load(assembledBytes)`, then steps 2–7 of the single-source
   path (rotations/resizes, stamps, watermark, new fields, metadata, outline,
   flatten, save). Output page indices now map 1:1 to loaded page indices.

Form fields on assembled pages stay interactive: the library rebuilds a
working `/AcroForm` from the kept widgets (since better-pdf 0.15.0), renaming
cross-source name collisions with per-source prefixes (`d0_`, `d1_`, …). A
page selected twice in the assembly shares one field object (fields linked,
not duplicated) — relevant if page duplication is ever exposed in the editor.

Trade-offs, inherent to combining files: `assemble` is a full-document save,
so the output is not an append-only revision of any one source (existing
digital signatures do not survive) and `/XFA` data is dropped (plain AcroForm
output). Pre-existing fields still survive as interactive fields — which the
old rebuild never provided.

## Source-field provenance (fill vs author vs rebuild)

Discovered during planning: `loadPdf` extracts the source's AcroForm fields
into editor elements (`extractFields` → `this.elements = detected`), and the
rebuild re-authors all of them. On the incremental path the originals are
still inside the loaded source, so re-authoring the extracted copies would
collide. The rule:

- On load, the editor snapshots the extracted fields (`EditState.sourceFields`,
  keyed by element id) and ships the snapshot with the export state.
- At export, each field element is classified against the snapshot:
  - **Not in snapshot** (user-created) → author via `createForm()`.
  - **In snapshot, unchanged** → skip; the source already contains it.
  - **In snapshot, value-only change** (`value`/`selectedValues` differ,
    everything else equal) → fill via `getForm()` (setText / check / select).
  - **In snapshot, structural change** (name, geometry, options, flags) or
    **deleted** (snapshot id missing from elements) → the incremental path
    cannot express it: full-rebuild fallback for the whole export.
- Fields the extractor skips (hidden/noView widgets, pushbuttons, unknown
  types) are untouched in the source and survive incremental export — an
  improvement over the rebuild, which drops them. Their names still count for
  collision validation (see below).
- Ordering per the 1.9.0 contract: all `createForm()` additions happen before
  the first `getForm()` call; fills, multi-select, and flatten follow.
- Value fills of source fields are supported single-source only; multi-source
  with a changed source-field value falls back to rebuild (assemble may have
  prefix-renamed the field).

## Toggle rename: "Compact PDF structure"

- UI label changes from "Optimize file size" to **"Compact PDF structure"** in
  the document-properties panel. Off by default (unchanged).
- Help text (to be finalized in implementation, content-wise): rebuilds the
  document using object streams for a marginally smaller file; requires PDF
  1.5+ readers; **removes the original PDF's interactive form fields**; leave
  off to preserve the original document (default).
- Internal plumbing keeps the `objectStreams` flag name through the store,
  history, export state, and the export command — only user-facing strings
  change.

## Editor collision validation

- Extracted source fields already occupy their names as editor elements, so
  the existing `fieldNameTaken` duplicate check covers most collisions today.
- The gap: fields the extractor skips (hidden widgets, pushbuttons, unknown
  types) and fields of *appended* documents (`appendPdf` does not extract).
  `extractFields` additionally returns the complete raw field-name list
  (`allNames`); the editor stores it per source doc — for doc 0 on `loadPdf`
  and for each appended doc on `appendPdf`.
- The field-properties modal validates a new/renamed field's name against the
  union of all sources' raw names, with error copy: "This name already exists
  in the original PDF."
- Export therefore never hits the library's collision rejection; if it somehow
  does, the export error surfaces through the existing error path.
- Multi-source note: `assemble` renames cross-source collisions among
  *pre-existing* fields with `d0_`/`d1_` prefixes. Editor validation for *new*
  field names checks against the union of all sources' field names plus their
  possible prefixed forms, so a new field can never collide post-assembly.

## MissingGlyphError handling (1.11.0 behavioral change)

`drawText()` now throws `MissingGlyphError` when a font lacks a glyph, instead
of silently dropping the character. This affects both the rebuild and
incremental paths wherever stamp text uses user-embedded fonts.

- Do **not** pass `onMissingGlyph: "skip"` — silent data loss stays fixed.
- Catch `MissingGlyphError` in the export command and map it to a friendly
  error telling the user which character/font failed, surfaced as an editor
  alert.

## Documented limitations

- Compact mode (rebuild) drops the source PDF's pre-existing interactive
  fields — stated in the toggle help text.
- Embedded-font form **fill** on fields created on a loaded document works for
  plain/multiline text fields since 1.11.0; comb, dropdown, and listbox fields
  remain standard-14-fonts-only for fill. Export only creates fields (never
  fills), so this is documentation, not a code path.
- Multi-source output is assembled (full-document save): existing digital
  signatures do not survive and `/XFA` is dropped, though pre-existing fields
  stay interactive.
- `objectStreams` has no effect on incremental saves (append-only) — the
  toggle forces the rebuild precisely so it can apply.

## Testing

1. **Dispatch:** toggle ON → rebuild; toggle OFF + single source →
   incremental; no source → blank create; multi-source → assemble +
   incremental.
2. **Field preservation:** fixture PDF that already contains fields → add a new
   field → export → reload → assert both original and new fields exist and are
   fillable.
3. **Assemble:** two sources with fields each, interleaved page order →
   assemble + incremental → reload → all original fields present and
   interactive (cross-source collisions carry `d0_`/`d1_` prefixes), new
   fields present.
4. **Flatten on incremental:** flatten ON → original and new fields both
   flattened into page content.
5. **Page ops on incremental:** rotate/resize/remove/move on a loaded source
   round-trip correctly.
6. **Collision validation:** editor rejects a new field named after an existing
   source field; renaming to a unique name clears the error.
7. **MissingGlyphError:** stamp text with a character absent from the embedded
   font → export fails with the friendly error (both paths).
8. **Provenance:** unchanged extracted field → not re-authored, single copy in
   output; value-only change → filled; structural change or deletion →
   rebuild fallback (and the rebuild output drops/reshapes it as today).
