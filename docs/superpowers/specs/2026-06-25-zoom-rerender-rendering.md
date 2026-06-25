# Spec: Re-rasterise pages on zoom (native-viewer sharpness)

Date: 2026-06-25
Status: Planned (not yet built)

## Problem

The editor rasterises each source page to a **fixed-resolution PNG data-URL once,
at load** (`src/lib/pdf/render.ts` → `renderSourcePdf`). The page raster is then
scaled by the editor's CSS `zoom`. A native PDF viewer re-rasterises on every
zoom change, so at high zoom (toward the `ZOOM_MAX = 4` cap) our page softens
while the exported PDF stays crisp.

Today's mitigation: a DPR-aware oversample (`round(devicePixelRatio * 2)`,
clamped `[2,4]`). Good at fit/normal zoom; still softens at extreme zoom because
the raster resolution is frozen at load.

## Goal

Match a native viewer's sharpness at **any** zoom by re-rendering visible pages
to a live `<canvas>` when the zoom changes — without regressing scroll/pan,
pointer math, overlays, thumbnails, or the export path.

## Decisions

- **Hybrid, not full rewrite.** Keep the cheap PNG data-URLs for thumbnails and
  as an instant placeholder; add a live `<canvas>` layer for the **main canvas
  only**. Thumbnails never need re-rendering on zoom.
- **Keep the PNG placeholder underneath** the live canvas until the sharp canvas
  paints, so zooming never shows a blank/soft flash. (Chosen over no-placeholder;
  costs a little memory.)
- **Pointer math unchanged.** The live canvas keeps its CSS box at
  `page.width*SCALE × page.height*SCALE`; the wrapper keeps applying CSS `zoom`.
  Only the canvas *backing store* grows with zoom. `cssScale = SCALE*zoom` and
  all overlay coordinates are untouched.

## Current architecture (touch points)

- `src/lib/pdf/render.ts` — `renderSourcePdf(bytes, scale)` produces PNG
  data-URLs + scale-1 dims, then **destroys** the pdf.js doc. Resolution frozen.
- `src/routes/editor/editor.svelte.ts` — holds `renderedByDoc: RenderedPage[][]`
  (PNGs), `sources: Uint8Array[]` (bytes, used by export), `zoom`, `pageRender(i)`.
- `src/routes/editor/Canvas.svelte` — per-page `<div>` sized `page*SCALE` with a
  centred `<img src=dataUrl>` + overlays; wrapper `style="zoom: {editor.zoom}"`.
- `src/routes/editor/PageManager.svelte` — thumbnails reuse `pageRender(i)`.

## Plan

### 1. Keep the pdf.js document alive
- Add a small cache (new `src/lib/pdf/pdf-doc-store.ts`, or fields on
  `EditorState`) that lazily opens and caches a `PDFDocumentProxy` per `docIndex`
  from `sources[docIndex]` bytes (open from a **copy** — pdf.js detaches buffers).
- Stop destroying the doc inside `renderSourcePdf` (or split: `renderSourcePdf`
  still emits thumbnail PNGs + dims; new `getPdfDoc(docIndex)` returns the live
  proxy). Destroy all cached docs in `clearSource()` and on editor teardown.

### 2. `PdfPageCanvas.svelte` (new) — the live raster
- Props: `editor`, `docIndex`, `sourceIndex`, `page` (dims), `rotation`.
- Layout: `<canvas>` with `style.width = page.width*SCALE`,
  `style.height = page.height*SCALE` (unchanged display box). The existing PNG
  `<img>` sits **behind** it as a placeholder.
- Backing store: render with
  `getViewport({ scale: SCALE * editor.zoom * (devicePixelRatio || 1) })` so the
  canvas is 1:1 with on-screen device pixels at the current zoom.
- Re-render reactively when `editor.zoom` **settles**, debounced ~150ms, so
  dragging/stepping zoom doesn't thrash.
- Cancel the in-flight `RenderTask` before starting a new one
  (`renderTask.cancel()`); guard against out-of-order completions (only the
  latest requested scale wins).
- Fade/replace the placeholder once the sharp canvas has painted.

### 3. Render only what's visible
- `IntersectionObserver` per page so an N-page doc re-renders just on-screen
  pages; off-screen pages (re)render when scrolled into view.

### 4. Wire into `Canvas.svelte`
- Replace the `<img>` block with `<PdfPageCanvas …>` for `source` pages. Blank
  pages stay as-is. Overlays and the `+ Add page` button are untouched.

### 5. Thumbnails unchanged
- `PageManager` keeps using the PNG `pageRender(i)` — tiny and cheap. The PNG
  oversample can drop back to ~1.5–2× since it's now placeholder/thumbnail only.

### 6. Memory / lifecycle
- `page.cleanup()` after each render; cap cached docs; destroy `PDFDocumentProxy`
  instances on `clearSource()` and component teardown.

## Risks / trade-offs

- **CPU**: re-rendering on zoom is work; debounce + visible-only + cancellation
  keep it smooth. Worst case = many large pages zoomed fast.
- **Memory**: live canvases at `zoom*dpr` for big pages are large; mitigated by
  rendering only visible pages and capping cached docs.
- **Flicker**: handled by the PNG placeholder underneath.

## Test plan

- **Unit**: doc-store caches + destroys correctly; render cancellation always
  resolves to the latest requested scale.
- **Component**: `PdfPageCanvas` requests viewport scale `SCALE*zoom*dpr` and
  re-renders on zoom change (mock pdf.js).
- **E2E (Playwright)**: zoom to 400%, assert page-canvas backing-store width ≈
  `points*SCALE*4*dpr`; text edges crisp; no blank flash; multi-page doc renders
  lazily on scroll.

## Out of scope

- The export path: unchanged. Export still rebuilds from `sources` bytes, so
  on-screen rendering quality never affects output.
- Tiled rendering / progressive refinement (a real viewer's full strategy) — not
  needed at our page sizes; revisit only if large-format PDFs prove janky.

## Scope estimate

1 new lib module + 1 new component; edits to `Canvas.svelte`,
`editor.svelte.ts`, `render.ts`. Medium, isolated from export.
