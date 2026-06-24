# PR3: Vector & Content Richness — Implementation Plan

**Goal:** Add freehand/SVG-path & polygon drawing tools, hyperlink elements
(external URL or internal go-to-page), and custom font upload/embed for static
text. Extends PR1 drawing tools and PR2 element/registry/validator plumbing.

**Builds on:** PR1 + PR2 (both merged). Reuses the `Tool` model, renderer +
overlay registries, `export-validate.ts`, and the D3 export rebuild in
`src/lib/pdf/build.ts`.

## Verified better-pdf API (confirmed against installed types)

All draw coords are PDF convention: origin **bottom-left**. Flip from the
editor's top-left points with the existing `src/lib/pdf/coords.ts` helpers
(`topLeftToPdfY(y, height, pageHeight)` for rects; for a bare point use
`pageHeight - y`).

```ts
page.drawSvgPath(d: string, opts?: { fill?: Color; stroke?: Color; strokeWidth?: number; opacity?: number })
  // d supports M/L/H/V/C/S/Q/T/Z. Arc 'A' THROWS. Coords baked into d (bottom-left).
page.drawPolygon(points: {x:number;y:number}[], opts?: { fill?; stroke?; strokeWidth?; opacity?; closed?: boolean })
  // >= 2 points, bottom-left. closed defaults true; pass closed:false for an open polyline.
page.drawLink({ x, y, width, height, url? , goToPage? })
  // rect bottom-left. EXACTLY ONE of url | goToPage (0-based page index).
doc.embedFont(bytes: Uint8Array, opts?: { subset?: boolean }): Promise<PdfFont>
page.drawText(text, { font: PdfFont, ... })   // pass an embedded PdfFont handle to render Unicode
```

`rgb(r,g,b)` (0..1) → `Color`. `PdfFont` from `doc.embedFont`; do NOT inspect its
`.name` for embedded fonts.

## Data model — `src/lib/pdf/types.ts`

```ts
export interface PathElement {
	type: 'path';
	id: string;
	x: number;
	y: number; // bounding-box top-left (top-left origin, PDF pts)
	page?: number;
	points: { x: number; y: number }[]; // absolute top-left-origin PDF points
	closed?: boolean; // false for freehand polyline; true for closed shape
	strokeColor?: { r: number; g: number; b: number };
	strokeWidth?: number;
	fillColor?: { r: number; g: number; b: number };
	opacity?: number;
}

export interface PolygonElement {
	type: 'polygon';
	id: string;
	x: number;
	y: number;
	page?: number;
	points: { x: number; y: number }[]; // absolute top-left-origin PDF points
	closed?: boolean; // default true
	strokeColor?;
	strokeWidth?;
	fillColor?;
	opacity?; // same shapes as PathElement
}

export interface LinkElement {
	type: 'link';
	id: string;
	x: number;
	y: number;
	width: number;
	height: number; // top-left origin
	page?: number;
	url?: string; // external; mutually exclusive with goToPage
	goToPage?: number; // 0-based internal target
}
```

Add all three to the `EditElement` union. Keep `x`/`y` as the bounding box of the
points so `startDrag` moves the whole element (translate all points by delta).

For embedded fonts, extend `EditState` and `TextElement`:

```ts
export interface EmbeddedFontAsset {
	id: string;
	name: string;
	bytes: Uint8Array;
}
// EditState gains:  fonts?: EmbeddedFontAsset[];
// TextElement gains: fontId?: string;   // references EmbeddedFontAsset.id; overrides `font`
```

## Renderers (lib coverage: exercise BOTH drawSvgPath and drawPolygon)

`RenderContext` (`src/lib/pdf/renderers/types.ts`) gains
`fonts: Record<string, PdfFont>` (embedded-font handles, keyed by asset id;
empty in blank/no-font cases).

- `renderers/path.ts` (`renderPath`): build an SVG `d` string from `points`
  (flip each point's Y: `pageHeight - p.y`), `M x0 y0 L x1 y1 …` (+ `Z` if
  `closed`), call `page.drawSvgPath(d, { stroke, strokeWidth, fill?, opacity? })`.
- `renderers/polygon.ts` (`renderPolygon`): map `points` to flipped `{x, y}` and
  call `page.drawPolygon(pts, { stroke, strokeWidth, fill?, opacity?, closed })`.
- `renderers/link.ts` (`renderLink`): `page.drawLink({ x, y: topLeftToPdfY(y,height,pageHeight), width, height, ...(url?{url}:{goToPage}) })`.
- `renderers/text.ts`: if `element.fontId` and `ctx.fonts[fontId]` exists, pass
  that handle as `font`; else keep the StandardFonts path. (Embedded font wins.)

Register `path`, `polygon`, `link` in `renderers/index.ts`. NOTE: PR2 typed the
registry to exclude `field` (authored, not stamped) — add the three new stamped
types alongside text/image/shape.

## Build — `src/lib/pdf/build.ts`

In `stampAndAuthor` (or `buildPdf` setup), before stamping: embed each
`state.fonts` asset once via `doc.embedFont(bytes)` into a
`Record<string, PdfFont>` and thread it into the `RenderContext` for every
`renderElement` call. On `embedFont` failure for one asset, skip it (text falls
back to standard font) — do not fail the whole export.

`path`/`polygon`/`link` are stamped like other non-field elements through the
registry — no special-casing needed beyond the new renderers. Confirm a font
asset referenced by no text element is simply unused (harmless).

## Tool model — `src/routes/editor/constants.ts` + `editor.svelte.ts`

Extend `DrawKind` with `'path' | 'polygon' | 'link'`. (They stay in the drawing
group, separate from fields.) Wire creation:

- `path` (freehand): pointerdown→move samples points into a new `PathElement`
  (`closed:false`); pointerup commits + `resetTool()`. Reuse the
  `beginShapeDraw` pattern (a new `beginFreehandDraw`).
- `polygon`: click to add vertices, double-click / Enter to close
  (`closed:true`), Esc cancels. (MVP: a simpler click-drag bounding polygon is
  acceptable if multi-click proves fiddly — but prefer real multi-vertex.)
- `link`: drag a rect like a shape → `LinkElement` (default `url:''`); the
  floating toolbar edits the target.
  Add `selectedPath`/`selectedPolygon`/`selectedLink` deriveds as needed.
  `startDrag` must translate `points[]` for path/polygon (not just x/y).

## Overlays

- `overlays/PathOverlay.svelte` + `PolygonOverlay.svelte`: render an inline
  `<svg>` (scaled by SCALE) showing the polyline/polygon; selectable + draggable.
- `overlays/LinkOverlay.svelte`: a translucent rectangle (dashed border) showing
  the link target; selectable + draggable + resizable.
  Register all three in `overlays/index.ts`.

## Floating toolbar — `src/routes/editor/FloatingToolbar.svelte`

- Path/polygon selection: stroke color, fill toggle/color, stroke width, opacity,
  duplicate, delete.
- Link selection: a target editor — radio "URL" vs "Page", with a text input
  (URL) or number input (0-based page) — duplicate, delete. Enforce exactly one
  of url/goToPage in the model.
- Text selection: add a **custom font** entry — an "Upload font" control
  (`.ttf`/`.otf`) that reads bytes, registers an `EmbeddedFontAsset` on the
  editor (a `Record<string, asset>`), and sets the selected text's `fontId`; plus
  a way to switch back to a standard font (clear `fontId`). The overlay preview
  may keep showing a generic family (browser can't easily render the uploaded
  font without a FontFace — OPTIONAL: load via `FontFace` for fidelity).

## EditorState font assets

Store embedded fonts as `embeddedFonts = $state<Record<string, EmbeddedFontAsset>>({})`
(Record, not Map — eslint rule). On export, include
`fonts: Object.values(embeddedFonts assets referenced by some text element)` in
the `EditState` (or include all; unused are harmless). Add a reader
`readFont(file): Promise<EmbeddedFontAsset | null>` with a size cap.

## Validation — `src/routes/editor/export-validate.ts`

Add cases (required, or new-element exports 422):

- `path` / `polygon`: `points` is an array (len ≥ 2 for polygon, ≥ 1 for path) of
  `{x,y}` finite numbers; cap point count (e.g. ≤ 10_000); finite stroke width /
  opacity if present.
- `link`: finite geometry; EXACTLY ONE of `url` (string ≤ 2048) | `goToPage`
  (finite int ≥ 0). Reject both-or-neither.
- `text`: accept optional `fontId` (string).
- Validate `state.fonts` if present: array, each `{ id:string, name:string,
bytes:Uint8Array }`, bytes size cap (e.g. ≤ 5MB each), count cap.

## Tests (unit-first, both projects)

- `build.path.test.ts`: a path renders to a valid PDF (drawSvgPath) — no throw.
- `build.polygon.test.ts`: a polygon renders (drawPolygon).
- `build.link.test.ts`: external URL link + internal goToPage link both render.
- `build.font.test.ts`: an embedded font (use a tiny real .ttf fixture, or skip
  with a clear note if none available) is embedded and a text element using it
  renders to a valid PDF. If no fixture font is bundled, write a focused test
  that asserts `renderText` selects `ctx.fonts[fontId]` when present (unit, mock).
- `editor.svelte.test.ts`: path/polygon/link tools create the right element and
  reset; link enforces single target; startDrag translates points.
- `export-validate.test.ts`: accepts path/polygon/link + fontId; rejects a link
  with both url and goToPage, and a non-finite point.
- `coords`/registry: link rect Y-flip round-trips.

## Gates (each must pass before commit)

`bun run check` (0 errors), `bun run test` (all pass), `bun run lint` (exit 0),
`bun run build` (exit 0). bun/bunx. Strict TS conditional spread. No Map/Set in
reactive state. `resolve()` for nav. A `.remote.ts` exports only remote
functions. Format changed files with prettier. Don't touch vendored `pdf-forms/`.

## Commit

One cohesive commit on branch `pr3-vector-links-fonts`:
`feat(editor): PR3 — vector paths/polygons, hyperlinks, custom font embed`
ending with the Co-Authored-By trailer used in earlier PRs.
