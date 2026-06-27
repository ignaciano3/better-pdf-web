# Home page — additional sections

**Date:** 2026-06-27
**File touched:** `src/routes/+page.svelte` (additive only)

## Problem

The home page has only two real content sections (Hero + Features). After the
features list it goes straight to the footer, so a visitor who scrolls to the
bottom — the most engaged audience — has no call to action. The page also never
explains how easy the flow is, nor answers the obvious objections (privacy,
account required, cost).

## Goal

Add three additive sections between Features and the Footer, reusing the existing
design system, with no new dependencies and no client-side state that could
break hydration.

Funnel after change: _what it does (Features) → how easy it is (How it works) →
objections answered (FAQ) → go do it (Closing CTA)_.

## Design system constraints

Reuse what `+page.svelte` already uses: `max-w-6xl` container, slate palette,
`blue-600` accent, `font-display` headings, mono labels for eyebrows, `rounded`
cards, `border-slate-200`. No JS state. No new imports beyond what's present
(`resolve`, `page`).

## Sections

### 1. How it works (3 steps)

`md:grid-cols-3`, stacks on mobile. Mono `01 / 02 / 03` eyebrows.

- **01 — Open a PDF** — Start a blank document or upload an existing file.
- **02 — Edit everything** — Fill fields, add text and images, draw, sign, merge
  and reorder pages.
- **03 — Export** — Download your finished PDF. Free up to 2 exports per hour —
  no account, no watermarks.

### 2. FAQ

Native `<details>`/`<summary>` accordion — accessible, zero-JS. 5 items, all from
real product facts (pricing page + footer):

- **Do I need an account?** No. All tools are free with no sign-up — 2
  exports/hour, or 5 signed in.
- **Are my files private?** Yes. Never stored on our servers — only sent to build
  your export, then discarded. No watermarks.
- **What does it cost?** The editor is free. Pro is $6/mo (or $48/yr — $4/mo) for
  unlimited exports and priority processing. A $3 day pass is coming soon.
- **What can I edit?** Fill AcroForm fields, add text and images, draw and sign,
  merge/split/reorder pages, embed custom fonts, add links and bookmarks.
- **Does it work on mobile?** Yes — the editor supports touch for drawing and
  dragging.

### 3. Closing CTA

Full-width tinted band (`bg-slate-900`, white text) for contrast right before the
footer. Heading _"Ready to edit your PDF?"_, the same two buttons as the hero
(Create new PDF / Edit existing PDF), and the no-sign-up reassurance line.

## Non-goals

- No pricing teaser section (deferred).
- No changes to hero, trust strip, features, or footer.
- No testimonials / social proof (inauthentic for a solo open-source project).

## Verification

- Run impeccable skill checks on the changed markup.
- `bun run check` (svelte-check / typecheck) and `bun run lint` must pass.
- Confirm no changes outside the three new sections.
