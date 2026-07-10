# Per-tool SEO landing pages — design

**Date:** 2026-07-09
**Status:** Approved pending user review

## Goal

Online PDF tools are discovered almost exclusively through search intent
("merge pdf online", "fill pdf form free"). The site currently exposes only
`/` and `/pricing` to crawlers. This project adds one indexable landing page
per editor operation, each funneling directly into the editor with the
relevant tool activated.

## Scope

Six English-language pages in v1:

| Slug             | Target intent            | Editor deep-link (`?operation=`) |
| ---------------- | ------------------------ | -------------------------------- |
| `fill-pdf-form`  | fill pdf form online     | `fill`                           |
| `sign-pdf`       | sign pdf online          | `sign`                           |
| `merge-pdf`      | merge/combine pdf        | `merge`                          |
| `split-pdf`      | split/extract pdf pages  | `split`                          |
| `watermark-pdf`  | add watermark to pdf     | `watermark`                      |
| `edit-pdf`       | edit pdf online          | `edit`                           |

Out of scope for v1 (deliberately deferred, architecture must not block them):

- Spanish/i18n versions (registry-as-data makes this a translation task later).
- Additional tool pages (rotate, reorder, delete pages, …) — one registry
  entry each once the pattern ships.
- Client-side export / freemium-model rework (separate design discussion).

## Architecture

**Content registry.** `src/lib/seo/tools.ts` exports a typed `TOOLS` array.
Each entry:

- `slug` — URL path segment (e.g. `merge-pdf`).
- `title` — browser/OG title.
- `metaDescription` — meta description.
- `h1`, `heroCopy` — hero heading + one-paragraph value prop.
- `steps` — exactly 3 `{ title, text }` "how it works" steps.
- `faq` — 4–6 `{ q, a }` items.
- `operation` — value for the editor deep link.
- `cardBlurb` — one-liner for cross-link cards.

**Dynamic route.** `src/routes/[tool]/+page.server.ts` looks the slug up in
the registry and throws 404 on miss. SvelteKit matches static routes
(`/pricing`, `/login`, …) before the `[tool]` param, so no shadowing.
The route is **SSR, not prerendered**: the root layout's server `load`
resolves the signed-in user, so prerendering would bake a logged-out header
into the static HTML. The registry lookup is trivially cheap; SSR matches
every other page (nothing in the repo prerenders today).

`src/routes/[tool]/+page.svelte` renders the shared page layout from the
registry data.

## Page anatomy

Each page (~400–600 words), reusing the existing landing page's Tailwind
visual patterns:

1. **Hero** — H1, value-prop paragraph, primary CTA
   (`/editor?operation=<op>`), reassurance line:
   _"Free, no signup required — your files are never stored."_
2. **How it works** — the 3 registry steps.
3. **Privacy/USP block** — honest claims only (see Copy rules below):
   editing happens in the browser; exported files are processed in memory
   and never stored; free tier has no watermarks.
4. **FAQ** — accordion of the registry FAQ items.
5. **More PDF tools** — card grid linking the other five pages,
   registry-driven.

**SEO head** via existing `Seo.svelte` with two JSON-LD blocks:

- `FAQPage` generated from the `faq` array.
- `WebApplication` (name, description, offers: free tier).

## Copy rules (fact-checked 2026-07-09)

The claim "files never leave your browser" is **false** and must not appear
anywhere. Verified data flow:

- Every upload sends the PDF bytes to the server for AcroForm field
  extraction (`extractFields` command — `editor.svelte.ts:1237`, `:1324`).
- Export sends the full source PDF(s) (≤60 MB) in the editor state; the
  server builds the final PDF (`export.remote.ts`).

Claims that ARE true and may be used:

- All interactive editing (rendering, dragging, drawing, filling) runs in
  the browser — no per-edit network traffic.
- Files are never stored: processed in memory and discarded. The export
  error log records message/stack only; usage events record tier/user/ipHash
  metadata only; no blob/file storage exists.
- Free tier applies no watermarks.

Canonical USP phrasing: _"Private by design — editing happens in your
browser, and when you export, your files are processed in memory and never
stored."_

## Editor funnel

Extend the existing `?operation=` effect in `src/routes/editor/+page.svelte`
(currently handles `new` / `upload`). New values (`fill`, `sign`, `merge`,
`split`, `watermark`, `edit`) all open the file picker immediately (like
`upload`), and set a local `pendingIntent` that fires once the PDF loads:

| Operation   | Post-load intent                                        |
| ----------- | ------------------------------------------------------- |
| `merge`     | open Pages panel + trigger the append-PDF picker        |
| `split`     | open Pages panel (extract/reorder lives there)          |
| `sign`      | open the signature pad                                  |
| `watermark` | open the watermark modal                                 |
| `fill`      | nothing extra (detected fields are immediately usable)  |
| `edit`      | nothing extra                                           |

`pendingIntent` is page-component state; no `EditorState` API changes beyond
what already exists (`showPages`, signature pad state, watermark modal state).
Unknown operation values are ignored (current behavior).

## Discovery wiring

- **Sitemap** — `src/routes/sitemap.xml/+server.ts` derives tool pages from
  the registry (priority 0.9, changefreq weekly) alongside the existing
  static entries.
- **Home page** — new "Tools" section using the same card grid, linking all
  six pages (internal links drive indexing).
- **Footer** — tool links added to the footer only; header stays clean.

## Error handling

- Unknown `[tool]` slug → 404 via the route load function.
- Registry is static data; malformed entries are caught by tests, not at
  runtime.
- Editor: unknown `operation` values ignored; `pendingIntent` fires at most
  once and is cleared after firing.

## Testing

- **Registry invariants** (Vitest): unique slugs, slugs are URL-safe,
  exactly 3 steps, 4–6 FAQ items, `operation` values match the editor's
  accepted set, all copy fields non-empty.
- **Route load**: known slug returns page data; unknown slug 404s.
- **JSON-LD**: FAQPage block matches schema shape for a sample entry.
- **Editor intent mapping**: unit test alongside existing editor tests —
  each operation value produces the right intent; intent fires once.
- **Copy review**: drafted by the implementer, reviewed by the user in PR.
