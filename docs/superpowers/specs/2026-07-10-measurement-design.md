# Measurement: analytics + Search Console readiness — design

**Date:** 2026-07-10
**Status:** Approved pending user review

## Goal

The SEO landing pages are live-ready but nothing measures whether they work.
Add privacy-friendly web analytics (Umami Cloud, free tier) with five funnel
events covering landing → editor → export → paywall → checkout, plus Google
Search Console readiness. Everything after this milestone becomes measurable.

## Decisions already made

- **Provider:** Umami Cloud free tier (cookieless, no consent banner needed,
  100k events/month, custom events supported).
- **Integration:** script tag + typed wrapper module (approach A). No
  first-party proxy for now — the wrapper isolates call sites, so a proxy
  can be added later without touching them.
- **Events:** the core funnel of five (below). No signup/blank-start/failed
  events in v1.

## Architecture

**Wrapper module** — `src/lib/analytics.ts`:

```ts
export type FunnelEvent =
	| 'tool-cta-click'
	| 'editor-loaded-pdf'
	| 'export-success'
	| 'export-rate-limited'
	| 'checkout-click';

export function track(event: FunnelEvent, data?: Record<string, string | number>): void;
```

`track` delegates to `window.umami?.track(event, data)` and silently no-ops
when Umami is absent (dev, ad-blocker, env unset, SSR/prerender). The
`FunnelEvent` union is the single source of the event vocabulary — a typo at
a call site is a compile error.

**Script tag** — root `+layout.svelte` `<svelte:head>`, rendered only when
`PUBLIC_UMAMI_WEBSITE_ID` (from `$env/static/public`) is non-empty:

```svelte
<script defer src="https://cloud.umami.is/script.js" data-website-id={PUBLIC_UMAMI_WEBSITE_ID}></script>
```

Static public env is baked into the prerendered tool pages at build time —
acceptable: the website ID is public by nature (visible in served HTML).
When the env is unset (local dev default), no script renders and `track`
no-ops — zero behavior change.

**Search Console verification** — same `<svelte:head>`: when
`PUBLIC_GOOGLE_SITE_VERIFICATION` is non-empty, render
`<meta name="google-site-verification" content={...} />`. (DNS verification
also works; the env is optional either way.)

Both env vars are documented in `.env.example` (empty defaults).

## The five events

| Event                 | Call site                                                                 | Data                       |
| --------------------- | ------------------------------------------------------------------------- | -------------------------- |
| `tool-cta-click`      | Both CTAs (hero + closing) on `src/routes/[tool]/+page.svelte`            | `{ tool: slug }`           |
| `editor-loaded-pdf`   | `src/routes/editor/+page.svelte` `onEmptyUpload`, only when the load succeeded (`errorMessage === null`) | `{ operation }` — the `?operation=` value or `'direct'` |
| `export-success`      | `EditorState.export` in `src/routes/editor/editor.svelte.ts`, after `downloadPdf(bytes)` | none                       |
| `export-rate-limited` | Same method, in the branch that sets `this.upsell` (the 429 path)          | `{ limit }` from the parsed upsell payload |
| `checkout-click`      | `startCheckout` in `src/routes/pricing/+page.svelte`, at the top           | `{ plan: 'monthly' \| 'annual' }` |

Scoping note: `editor-loaded-pdf` instruments only the empty-state upload
(the funnel entry from landing pages / home CTAs). Toolbar re-uploads and
appends are deliberately not funnel events.

`editor.svelte.ts` is a client-side module, so importing `$lib/analytics`
there is safe; the wrapper's own guard covers any non-browser execution.

## Search Console checklist

`docs/launch/search-console.md` — a short operator checklist (user actions,
not code): verify the production domain (DNS or the meta-tag env) → submit
`/sitemap.xml` → request indexing for the six tool pages → after a week,
read the Queries report to see which keywords pull impressions and which
pages need better titles/descriptions. Include the exact GSC URLs.

## Privacy consistency

Umami is cookieless and does not store IPs; the site's "private by design"
copy and the absence of a consent banner remain accurate. No user-facing
copy changes in this milestone.

## Error handling

- Umami script fails to load (blocked/offline): `window.umami` stays
  undefined; `track` no-ops. No console noise, no user impact.
- Events must never throw into product flows: `track` wraps the delegate
  call in a try/catch.

## Testing

- `src/lib/analytics.test.ts`: `track` no-ops without `window.umami`
  (including window undefined); forwards event name + data when present;
  swallows a throwing `umami.track`.
- Call sites: covered by the `FunnelEvent` compile-time union plus the
  existing editor/pricing suites still passing (no behavioral assertions on
  analytics in v1 — the wrapper is the tested seam).
- `bun run build` must still prerender the six tool pages (head change
  touches the shared layout).

## Out of scope (deliberate)

- First-party proxy for ad-blocker resilience (add later behind the same wrapper).
- Signup / blank-start / export-failed events.
- Dashboards beyond what Umami Cloud provides; the existing `/admin` +
  `usageEvent` table remains the server-side source of truth for exports.
