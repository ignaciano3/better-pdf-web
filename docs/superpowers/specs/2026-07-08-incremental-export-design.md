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
- **Multi-source** documents are handled per-source incrementally, then merged.

## Export dispatch (`src/lib/pdf/build.ts`)

`buildPdf(state)` dispatches:

| Condition | Path |
|---|---|
| Compact toggle ON (`state.objectStreams`) | Current full rebuild, unchanged |
| No source | Current `create()` blank path, unchanged |
| Source(s), toggle OFF, multi-source with interleaved page order | Full rebuild (fallback) |
| Source(s), toggle OFF, otherwise | **New incremental path** |

### Incremental path, single source

1. `PdfDocument.load(sourceBytes)`.
2. Apply page ops on the loaded doc: `setRotation`, `setSize`/`setMediaBox`,
   `insertPage`, `removePage`, `movePage`. (All supported incrementally.)
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

### Incremental path, multiple sources

Works when the output page order does not interleave pages from different
sources (each source's pages form one contiguous, in-order-per-source run;
within-source reorder is fine via `movePage`):

1. For each source: load → apply that source's page ops, stamps, and fields
   (steps 1–4 above, with output-page → source-page index mapping) → `save()`.
2. `PdfDocument.merge([bytes...])` — full-document save.
3. Load the merged bytes once more; apply document-wide metadata, outline
   (indices are merged-document page indices), and flatten; incremental
   `save()`.

If the page order interleaves sources, fall back to the full rebuild.

**Verification gate:** a test must confirm `PdfDocument.merge` preserves
AcroForm fields from its inputs (README implies it; not explicitly stated). If
it does not, multi-source falls back to rebuild unconditionally and this spec's
multi-source section is deferred.

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

- On PDF load, read the source's existing field names client-side (a separate
  read-only `PdfDocument.load()` + form read; never the instance used for
  export) and store them per source in editor state (`editor.svelte.ts`).
- The field-properties panel validates a new/renamed field's name against
  existing source field names, in addition to the current duplicate-among-new-
  fields validation. Error copy: "This name already exists in the original
  PDF."
- Export therefore never hits the library's collision rejection; if it somehow
  does, the export error surfaces through the existing error path.

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
- Multi-source with interleaved page order uses the rebuild path (original
  fields dropped there, as today).
- `objectStreams` has no effect on incremental saves (append-only) — the
  toggle forces the rebuild precisely so it can apply.

## Testing

1. **Dispatch:** toggle ON → rebuild; toggle OFF + source → incremental;
   no source → blank create; interleaved multi-source → rebuild fallback.
2. **Field preservation:** fixture PDF that already contains fields → add a new
   field → export → reload → assert both original and new fields exist and are
   fillable.
3. **Merge gate:** two sources with fields each → incremental + merge → reload
   → all fields present. (If this fails, see verification gate above.)
4. **Flatten on incremental:** flatten ON → original and new fields both
   flattened into page content.
5. **Page ops on incremental:** rotate/resize/remove/move on a loaded source
   round-trip correctly.
6. **Collision validation:** editor rejects a new field named after an existing
   source field; renaming to a unique name clears the error.
7. **MissingGlyphError:** stamp text with a character absent from the embedded
   font → export fails with the friendly error (both paths).
