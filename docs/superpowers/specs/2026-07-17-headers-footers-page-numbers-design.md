# Headers, footers & page numbers — design

**Date:** 2026-07-17
**Status:** Implemented (2026-07-17)
**Library:** `@ignaciano3/better-pdf` (`page.drawText`, `font.widthOfTextAtSize`)

## Problem

Sejda stamps headers, footers, and page numbers across every page. We have none.
This is document-level stamping — the **watermark feature is the exact template**
(a config on `EditState`, a modal, and one per-page draw loop called from both
export paths). Not a canvas draw tool.

## Model — `src/lib/pdf/types.ts`

Add a document-level field on `EditState`, exactly like `watermark?: Watermark`
(types.ts ~143-144, 487-512):

```ts
export type HFPos = 'left' | 'center' | 'right';

// Header and footer are independent sections, each with its own styling, so a
// header can use one font and the footer another.
export interface HFSection {
  slots: Partial<Record<HFPos, string>>;  // template strings; empty/absent = skip
  font?: StandardFontName;                // default 'Helvetica'
  size?: number;                          // pt, default 10
  color?: { r: number; g: number; b: number }; // default {0,0,0}
  margin?: number;                        // pt from page edge, default 36 (0.5in)
}

export interface HeaderFooter {
  header?: HFSection;                     // top row; absent = no header
  footer?: HFSection;                     // bottom row; absent = no footer
  startAt?: number;                       // page-number value on the first numbered page, default 1
  skipFirst?: boolean;                    // omit stamping on page 0 (title pages), default false
}
```

Add `headerFooter?: HeaderFooter` to `EditState`. `startAt`/`skipFirst` are
document-wide (shared by both sections); font/size/colour/margin are per-section.

### Template tokens
Substituted per page inside the draw loop:
- `{n}` → current page number (`startAt + pageIndexAmongNumbered`)
- `{total}` → total numbered page count
- `{title}` → `metadata.title` if present (optional, nice-to-have)

So a footer center of `Page {n} of {total}` renders `Page 3 of 10`.

## State & UI — `editor.svelte.ts` + `HeaderFooterModal.svelte`

Clone the watermark wiring (editor.svelte.ts ~233-235, WatermarkModal.svelte):

- `headerFooter = $state<HeaderFooter | null>(null)` and
  `headerFooterModalOpen = $state(false)`.
- `HeaderFooterModal.svelte`: gated on `editor.headerFooterModalOpen`. An
  `ensure()` seeds defaults (like watermark's `ensure()` ~19-30). Six text inputs
  (a 3×2 grid for header/footer left/center/right) plus font, size, color,
  margin, `startAt`, and a `skipFirst` checkbox. Inputs mutate
  `editor.headerFooter.*` directly. A hint lists the available `{n} {total}
  {title}` tokens.
- Mount the modal from the editor page (`+page.svelte`) beside the other modals.
- Toolbar: a "Header & Footer" item in the Document menu (`Toolbar.svelte`)
  opening the modal — same place as Watermark/Metadata.
- **Export snapshot** (editor.svelte.ts ~1706-1707): include `headerFooter` only
  when at least one slot string is non-empty, via `$state.snapshot`.

## Export — `src/lib/pdf/build.ts`

Add `drawHeaderFooter(doc, pageWidths, pageHeights, cfg)`, modeled on
`drawWatermark` (build.ts 433-467), called once from **both** export paths after
elements are stamped — `buildIncremental` (near line 182) and the rebuild (near
line 601), same as the watermark calls.

Algorithm:

```
const font = doc.getFont(cfg.font as StandardFonts);
let numbered = 0;
for (let i = 0; i < pageHeights.length; i++) {
  if (cfg.skipFirst && i === 0) continue;
  const pageNo = cfg.startAt + numbered;   numbered++;
  const page = doc.getPage(i);
  const W = pageWidths[i], H = pageHeights[i];
  for (const [slot, tmpl] of Object.entries(cfg.slots)) {
    if (!tmpl?.trim()) continue;
    const text = tmpl.replaceAll('{n}', String(pageNo))
                     .replaceAll('{total}', String(/* total numbered */))
                     .replaceAll('{title}', metaTitle ?? '');
    const tw = font.widthOfTextAtSize(text, cfg.size);
    const isHeader = slot.startsWith('header');
    const y = isHeader ? H - cfg.margin - cfg.size : cfg.margin;
    const x = slot.endsWith('Left')   ? cfg.margin
            : slot.endsWith('Right')  ? W - cfg.margin - tw
            :                            (W - tw) / 2;  // Center
    page.drawText(text, { x, y, size: cfg.size, font, color: rgb(...), });
  }
}
```

Notes:
- `{total}` = count of numbered pages = `pageHeights.length - (skipFirst ? 1 : 0)`.
  Compute once before the loop.
- Y for header uses `H - margin - size` so the text baseline sits below the top
  margin (drawText Y is the baseline, bottom-left origin — same as watermark).
- No new renderer/overlay/element type; `export-plan.ts` untouched (this is
  document-level, like watermark).

## Testing

Vitest, matching watermark/build test style:

- `{n}`/`{total}` substitution correct across pages; `Page 2 of 5` etc.
- `startAt` offsets numbering; `skipFirst` omits page 0 **and** excludes it from
  `{total}` and from the numbered sequence.
- Left/center/right x-positioning uses `widthOfTextAtSize` (center + right).
- Header vs footer y-position (top-margin vs bottom-margin).
- Snapshot: config with all-empty slots is excluded from export (no stamping).
- Called from both incremental and rebuild export paths.

## Out of scope

- Per-page-range headers/footers (e.g. different for chapters) — single config
  for the whole doc in v1.
- Roman numerals / custom number formats — arabic only in v1.
- Images in header/footer (logo) — text only; watermark already covers image
  stamping if needed.
- Date/time tokens — can add `{date}` later; not in v1.
