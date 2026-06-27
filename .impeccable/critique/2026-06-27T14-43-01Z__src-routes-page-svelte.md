---
target: the home page
total_score: 32
p0_count: 0
p1_count: 2
timestamp: 2026-06-27T14-43-01Z
slug: src-routes-page-svelte
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Static page; hover/focus states present, nothing async to report |
| 2 | Match System / Real World | 4 | Plain, honest language throughout ("Free up to 2 exports per hour") |
| 3 | User Control and Freedom | 3 | n/a for a landing page; links behave |
| 4 | Consistency and Standards | 3 | Body prose drifts to slate-500 below the DS slate-600 floor; numbered features grid contradicts the design system's own bans |
| 5 | Error Prevention | 3 | No inputs to guard |
| 6 | Recognition Rather Than Recall | 4 | First action obvious; CTAs labeled |
| 7 | Flexibility and Efficiency | 3 | Two clear CTAs, keyboard-reachable |
| 8 | Aesthetic and Minimalist Design | 3 | Hero is excellent; features grid is a generic 6-card grid; mobile header is broken |
| 9 | Error Recovery | 3 | n/a |
| 10 | Help and Documentation | 3 | Microcopy carries it; GitHub link present |
| **Total** | | **32/40** | **Good — solid foundation, two real problems** |

## Anti-Patterns Verdict

**LLM assessment**: The hero does NOT look AI-generated — it's genuinely well-crafted: confident Space Grotesk headline, honest microcopy, restrained single-blue accent (≤10%), and a detailed, on-brand editor-preview mock that sells the product better than any stock screenshot. That's the strength.

The **features section undercuts it**. It is a textbook identical 3×2 card grid with `01 02 03 04 05 06` numbered markers, a "FEATURES" tracked-uppercase eyebrow, and icon-less title+body cards — three patterns the project's own DESIGN.md explicitly bans ("no identical icon-card grids, no tiny tracked-uppercase eyebrow above every section, no 01/02/03 numbered section scaffolding by reflex"). The numbers 01–06 carry no information — these are parallel features, not an ordered sequence — so the numbering is pure scaffolding. This is the one place the page reads as templated.

**Deterministic scan**: detector returned 4 advisories, all non-issues. Two `rgb(0,0,0)` hits are in PDF-renderer library code (`path.ts`, `polygon.ts`), not UI. The `text-slate-900 on bg-blue-50` flag at `+page.svelte:68` is a false positive — slate-900 is the resting color on white; blue-50 only appears on hover, where contrast stays high. The detector did NOT catch the real problems (numbered grid, mobile header, body-color drift) — those need a human eye.

**Visual overlays**: Browser injection/overlay not run — the Playwright MCP requires Chrome (uninstallable without sudo here). I drove the cached Chromium directly instead and captured desktop/tablet/mobile screenshots as the visual evidence.

## Overall Impression

A strong, trustworthy hero attached to a generic features grid. The single biggest opportunity is to rebuild the features section so it stops violating the project's own design system — right now the page argues against its own North Star ("not generic SaaS") in its second screen. Two things also break outright on mobile that desktop hides.

## What's Working

- **The editor-preview mock.** Hand-built window chrome, toolbar groups (CONTENT/FIELDS/SHAPES), a selected field with handles, checkbox/dropdown/signature/image placeholders, zoom pill. It's specific, on-brand, and does real selling work. Keep it.
- **Hero hierarchy and honesty.** Display headline → one-line value prop → two CTAs → mono trust line. The "Free up to 2 exports per hour, no account needed" and "files are never stored on our servers" copy directly serves the "never make the user feel hunted" principle.
- **Disciplined color.** Action Blue stays on CTAs, active states, and links only. Slate-and-white carries the rest. The Action-Blue Rule is respected.

## Priority Issues

- **[P1] Features section violates the project's own design system.** Identical 6-card grid + `01–06` numbered scaffolding + tracked-uppercase eyebrow are three named bans in DESIGN.md. The numbers encode no sequence.
  - **Why it matters**: This is the exact "generic SaaS" pattern the brand defines itself against. It's the one screen where a user could say "AI made this," and it sits right under an otherwise distinctive hero.
  - **Fix**: Drop the 01–06 numbers. Re-cut the six features into a non-uniform layout — e.g. a 2-column editorial list with the verb leading, or group them under the real task verbs (Fill / Create / Assemble) so structure carries meaning. If a kicker stays, make it one deliberate brand element, not an eyebrow.
  - **Suggested command**: /impeccable layout

- **[P1] Mobile header is broken.** At 390px the "Better PDF Web" logo wraps to two lines and the nav (GitHub icon, Pricing, Log in) collides with / overflows above the Sign up button — the top of the first screen is visibly garbled. (Lives in `src/lib/components/Header.svelte`, but it's the first thing a mobile visitor sees on this page.)
  - **Why it matters**: Broken chrome on the first mobile impression directly damages the "fast, precise, trustworthy" promise before the user reads a word.
  - **Fix**: Collapse the nav to a compact menu (or icon + Sign up only) below the `md` breakpoint; keep the logo on one line.
  - **Suggested command**: /impeccable adapt

- **[P2] Whole app is locked to `h-screen` with the page scrolling inside `<main class="overflow-auto">`.** Document-level scroll height stays pinned at the viewport; all scrolling happens in an inner container (`src/routes/+layout.svelte`).
  - **Why it matters**: On mobile, `h-screen` (100vh) ignores browser chrome and the inner scroll container prevents the address bar from collapsing, so the marketing page loses usable height and feels off. It can also disrupt scroll restoration and scroll-to-top. Landing pages want native document scroll.
  - **Fix**: For the home route, let the page use normal document flow (e.g. `min-h-screen` on the wrapper, no `overflow-auto` trap) so the body scrolls natively. Keep the locked layout for the editor only.
  - **Suggested command**: /impeccable adapt

- **[P2] Body prose set lighter than the design system's floor.** The features intro, all six card bodies, and the footer description use `text-slate-500` (#64748b); DESIGN.md sets Body Slate #475569 (slate-600) as the floor and says "never lighter for prose." It still passes WCAG AA on white (~5.9:1), so this is consistency, not contrast.
  - **Why it matters**: Drifting below your own documented floor is how a system erodes; the features copy reads a touch washed-out next to the ink headlines.
  - **Fix**: Move prose bodies to `text-slate-600`. Reserve slate-500/400 for meta and the mono trust line only.
  - **Suggested command**: /impeccable typeset

## Persona Red Flags

**Jordan (First-Timer)**: Lands fine — the hero is clear and the first action ("Create new PDF") is obvious within 5 seconds. But on mobile, the broken header is the very first thing seen and undermines trust before the value prop loads.

**Casey (Distracted Mobile User)**: Hit twice. The garbled header at the top of the screen, and the `h-screen` inner-scroll layout that eats usable height and keeps the mobile address bar pinned. Primary CTAs are reachable, but the page doesn't feel as fast/native as the "speed you can feel" principle promises.

**Riley (Stress Tester)**: Would immediately notice the 01–06 numbering implies a sequence that isn't one, and that the features grid is visually identical to every other SaaS site — i.e. the page doesn't deliver on its own "not generic SaaS" claim.

## Minor Observations

- Trust strip ("Private by design") with the small custom lock glyph is a nice, on-brand touch — keep it.
- `bg-[#ff5f57]` / `#febc2e` / `#28c840` (traffic-light dots) and `#1e293b` (signature stroke) in the mock are intentional illustration colors, not palette drift — fine.
- Footer "Powered by better-pdf — my open-source PDF library" is a good, honest dogfooding note.

## Questions to Consider

- What would the features section look like if the layout itself carried the hierarchy — one or two flagship capabilities shown large, the rest as a quiet list — instead of six equal cards?
- Does the home page need the editor's full-height locked shell at all, or is native document scroll the more confident choice here?
- If the numbers vanished, would anything be lost? If not, that's your answer.
