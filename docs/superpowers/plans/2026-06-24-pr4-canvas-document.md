# PR4: Canvas & Document Controls — Implementation Plan

**Goal:** Zoom + fit-to-width, change page sizes, merge/append a second uploaded
PDF, document properties (metadata), and an outline/bookmarks editor.

**Builds on:** PR1–PR3 (merged). Reuses the D3 export rebuild in
`src/lib/pdf/build.ts`, the `pageOps` model, and `export-validate.ts`.

## Verified better-pdf API (confirmed against installed types)

```ts
// Metadata (PdfDocument):
doc.setTitle(s); doc.setAuthor(s); doc.setSubject(s);
doc.setKeywords(string[]); doc.setCreator(s); doc.setProducer(s);
doc.setCreationDate(Date); doc.setModificationDate(Date);
doc.getMetadata(): Promise<DocumentMetadata>;
// Outline:
doc.setOutline(items: OutlineItem[])   // OutlineItem = { title: string; page: number (0-based); children?: OutlineItem[] }
// Page size (PdfPage):
page.setSize(width, height); page.setMediaBox(x0,y0,x1,y1);
// Merge: doc.embedPdfPage(srcBytes, srcIndex) — already used in the rebuild;
// a second source's pages embed the same way.
```

## Feature 1 — Zoom + fit-to-width (CLIENT ONLY, no lib/export change)

`EditorState` gains `zoom = $state(1)`. Apply it as a CSS multiplier on the pages
wrapper in `Canvas.svelte` (e.g. `transform: scale(zoom)` with
`transform-origin: top center`, or multiply the wrapper width) so overlays keep
using the fixed `SCALE` for hit-testing — DO NOT bake zoom into element coords.
IMPORTANT: pointer math in `placeAtClient`/`beginShapeDraw`/`startDrag`/freehand
divides `(clientX - rect.left) / SCALE`. If zoom scales the DOM, that math breaks.
Fix by dividing by `SCALE * zoom` everywhere a screen delta converts to points
(centralize: add an `EditorState.cssScale = $derived(SCALE * this.zoom)` and use
it in all pointer conversions). Verify drag/draw still land correctly at zoom ≠ 1
(add a unit test that drives placeAtClient with a zoomed state).

Controls in the header (Toolbar or a small zoom bar): `−` / `+` / percentage /
**Fit width** (compute `zoom = containerWidth / (pageWidth)` ; needs the canvas
container width — read via a bound element or ResizeObserver). Clamp zoom to
e.g. [0.25, 4].

## Feature 2 — Change page size

Model: a `PageOp` of kind `'source'` keeps the source size; allow an explicit
size override per output page. Add optional `size?: [number, number]` to the
`source` PageOp variant (currently only `blank` has `size`), OR add a parallel
`pageSizeOverride?: Record<number,[number,number]>` on EditState. Prefer
extending the `source` op with an optional `size`. On export rebuild
(`buildSourceRebuild`): when a source op has a `size` override, create the page
at that size and `drawPage` the embedded content scaled to fit (`width`/`height`
= override). Provide a UI (PageManager or a page-size dropdown: A4 / Letter /
Legal / A3, portrait/landscape) to set the override per page or for all pages.
Use `PageSizes` from `@ignaciano3/better-pdf/generate` for named sizes. Add a
unit test: an override changes the exported page's dimensions.

## Feature 3 — Merge / append a second PDF (multi-source)

Extend the source model to support more than one uploaded document:

- `EditState`: replace single `sourcePdf` usage with `sources?: Uint8Array[]`
  (keep `sourcePdf` as an alias for `sources[0]` for back-compat, OR migrate all
  call sites). Add `docIndex?: number` (default 0) to the `source` `PageOp`
  variant: which source document the page comes from.
- `EditorState`: `appendPdf(file)` — render the second doc's pages with
  `renderSourcePdf` (client, pdf.js), append `{ kind:'source', docIndex:1,
sourceIndex:i, rotation:0 }` ops, store its bytes in `sources[1]`, and append
  its rendered pages so the canvas shows them. `rendered`/`pageRender` must key
  by (docIndex, sourceIndex) — extend the rendered store to a per-source array
  (e.g. `renderedByDoc: RenderedPage[][]`) or a flat list addressed by op.
- `build.ts` `buildSourceRebuild`: for each `source` op, embed from
  `sources[op.docIndex ?? 0]` at `op.sourceIndex`. Everything else (stamp +
  fields) unchanged.
- `export-validate.ts`: validate `sources` (array of Uint8Array, per-file +
  total byte caps, count cap ≤ e.g. 5) and `docIndex` finite/in-range.
  UI: a "Merge PDF" button in the header (File zone). Add a unit/build test:
  appending a second PDF yields the combined page count and both docs' content.

This is the riskiest refactor — do it carefully and keep the single-source path
working (existing PR1–PR3 tests must stay green).

## Feature 4 — Document properties (metadata) modal

`EditState` gains `metadata?: { title?; author?; subject?; keywords?: string[];
creator?; producer? }`. A `DocumentPropertiesModal.svelte` (opened from the
header) edits these, bound to `EditorState.metadata` state. On export, apply via
the matching `doc.setX` calls in `build.ts` (both blank + source rebuild paths),
and `setModificationDate(new Date())`. NOTE: scripts in the build run server-side
so `new Date()` is fine there (this restriction is only for Workflow scripts).
`export-validate.ts`: validate metadata strings (length caps) + keywords array.
On upload, optionally pre-fill the modal from `doc.getMetadata()` (via a small
addition to the extract query or a new query) — OPTIONAL, nice-to-have.
Test: metadata written and re-readable (build → `PdfDocument.load` →
`getMetadata()`).

## Feature 5 — Outline / bookmarks editor

`EditState` gains `outline?: OutlineItem[]` (title + 0-based page + children).
An `OutlineEditor.svelte` (panel or modal) to add/remove/reorder/nest bookmarks,
each pointing at an output page. On export, `doc.setOutline(state.outline)` in
`build.ts` (guard: only if non-empty; validate each `page` is in range).
`export-validate.ts`: validate the outline tree (title strings, finite in-range
page indices, bounded depth/among count). Test: outline written and re-readable
(if the lib exposes outline reading; otherwise assert save succeeds and page
indices are in range).

## Renderers / registries

No new element types in PR4 — these are document-level controls, not stamped
elements. So `validateElement` does NOT need a new element case; instead extend
the top-level `validateExportInput` for `sources`, `metadata`, `outline`, and the
`source` PageOp `size`/`docIndex` fields.

## Gates (each must pass before commit)

`bun run check` (0 errors), `bun run test` (all pass), `bun run lint` (exit 0),
`bun run build` (exit 0). bun/bunx. Strict TS conditional spread. No Map/Set in
reactive state. `resolve()` for nav. `.remote.ts` exports only remote functions.
Format changed files with prettier. Don't touch vendored `pdf-forms/`.
ALL EXISTING PR1–PR3 TESTS MUST STAY GREEN (esp. the single-source export path).

## Commit

One cohesive commit on branch `pr4-canvas-document`:
`feat(editor): PR4 — zoom/fit, page sizes, PDF merge, metadata, outline`
ending with the Co-Authored-By trailer used in earlier PRs.

## Sequencing note

Features 1 (zoom) and 4 (metadata) and 5 (outline) are low-risk and independent.
Feature 3 (multi-source merge) is the highest-risk refactor; if time-constrained,
ship 1/2/4/5 first and gate 3 behind its own verification. Land whatever is green.
