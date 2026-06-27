---
name: better-pdf
description: A fast, precise, trustworthy browser PDF editor — the document is the hero, the UI recedes.
colors:
  action-blue: '#2563eb'
  action-blue-deep: '#1d4ed8'
  action-blue-wash: '#eff6ff'
  focus-blue: '#60a5fa'
  ink: '#0f172a'
  body-slate: '#475569'
  muted-slate: '#94a3b8'
  border-slate: '#e2e8f0'
  surface-slate: '#f8fafc'
  canvas-white: '#ffffff'
  danger: '#b91c1c'
  danger-wash: '#fef2f2'
  warning: '#92400e'
  success: '#16a34a'
  pro-violet: '#6b21a8'
  pro-violet-wash: '#f3e8ff'
typography:
  display:
    fontFamily: 'Space Grotesk, sans-serif'
    fontSize: 'clamp(2.375rem, 5.2vw, 3.875rem)'
    fontWeight: 700
    lineHeight: 1.03
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Space Grotesk, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.01em'
  title:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 'normal'
  body:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 'normal'
  label:
    fontFamily: 'IBM Plex Mono, ui-monospace, monospace'
    fontSize: '0.6875rem'
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: '0.1em'
rounded:
  sm: '4px'
  md: '6px'
  lg: '8px'
  xl: '12px'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '40px'
components:
  button-primary:
    backgroundColor: '{colors.action-blue}'
    textColor: '{colors.canvas-white}'
    rounded: '{rounded.lg}'
    padding: '10px 16px'
  button-primary-hover:
    backgroundColor: '{colors.action-blue-deep}'
    textColor: '{colors.canvas-white}'
    rounded: '{rounded.lg}'
    padding: '10px 16px'
  button-cta:
    backgroundColor: '{colors.action-blue}'
    textColor: '{colors.canvas-white}'
    rounded: '{rounded.xl}'
    padding: '14px 24px'
  button-ghost:
    backgroundColor: '{colors.canvas-white}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xl}'
    padding: '14px 22px'
  input:
    backgroundColor: '{colors.canvas-white}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
  card:
    backgroundColor: '{colors.canvas-white}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xl}'
    padding: '24px'
---

# Design System: better-pdf

## 1. Overview

**Creative North Star: "The Quiet Workbench"**

better-pdf is a workbench, not a showroom. The user came to do one job to one document, and the interface's first duty is to get out of the way and let the page itself be the only thing with color and weight. The surface is a calm field of white and slate; chrome is hairline-thin and near-flat at rest. Nothing competes with the document. When the user is ready to act, a single confident blue appears — and only then. The system reads as a well-kept instrument: fast, precise, trustworthy. Confidence comes from clarity and responsiveness, never from decoration.

This system explicitly rejects four things. It is **not Adobe-bloated** — no dense toolbars, no modal pile-ups, no chrome-heavy panels burying the page. It is **not a spammy free-tool site** — no popups, no conversion traps, no ad-shaped upsell; the free tier looks honest. It is **not generic SaaS** — no gradient-blob heroes, no cream/sand backgrounds, no identical icon-card grids, no tracked-uppercase eyebrow above every section. It is **not cold enterprise** — slate is warmed by a human, legible type stack and the occasional human touch, never sterile navy-and-gray.

Density is medium-low: generous breathing room on marketing surfaces, tighter and more instrument-like inside the editor where every pixel is contested by the canvas. Type does the hierarchy work; color does the action work; shadow does almost nothing.

**Key Characteristics:**

- Document is the hero; UI recedes to white + slate.
- One accent (Action Blue) means "act" — rare and earned.
- Flat and technical at rest; motion and color are responses to intent.
- Mono labels for meta/structure; geometric display for headlines.
- Honest, unhurried, never a dark pattern.

## 2. Colors

A near-monochrome slate-and-white field with a single decisive blue and a small, strictly functional set of status hues.

### Primary

- **Action Blue** (#2563eb): The only "do something" color. CTAs, the active/selected state, the focused tool, primary nav highlight. Its rarity is the entire point.
- **Action Blue Deep** (#1d4ed8): The pressed/hover state of every blue surface. Never a resting color on its own.
- **Action Blue Wash** (#eff6ff): Faint blue fill for selected rows, hovered ghost buttons, active-tool backgrounds. The lightest hint that blue is near.
- **Focus Blue** (#60a5fa): Focus-visible ring only. Keyboard users must always see it.

### Neutral

- **Ink** (#0f172a — slate-900): Headlines, primary text, high-emphasis labels.
- **Body Slate** (#475569 — slate-600): Body copy and secondary text. Hits 4.5:1 on white; this is the body floor — do not go lighter for prose.
- **Muted Slate** (#94a3b8 — slate-400): Meta, mono captions, placeholder-level text. Decorative/structural only — never body copy.
- **Border Slate** (#e2e8f0 — slate-200): Hairline borders, dividers, card edges. The default 1px stroke everywhere.
- **Surface Slate** (#f8fafc — slate-50): The one step off white — toolbar strips, inset panels, table-header rows.
- **Canvas White** (#ffffff): The dominant background. The document sits on it; the UI dissolves into it.

### Tertiary (status — functional only)

- **Danger** (#b91c1c — red-700) on **Danger Wash** (#fef2f2 — red-50): Errors, destructive actions, export-gate failures.
- **Warning** (#92400e — amber-800): Non-blocking cautions (e.g. links with no target, pre-export warnings).
- **Success** (#16a34a — green-600): Confirmation of completed actions.
- **Pro Violet** (#6b21a8 — purple-800) on **Pro Violet Wash** (#f3e8ff — purple-100): The _only_ place a second identity hue is allowed — Pro/upgrade affordances. Keeps "upgrade" visually distinct from "act" (blue), so the upsell never masquerades as a core action.

### Named Rules

**The Action-Blue Rule.** Blue is a verb. It appears on ≤10% of any screen and only where the user can act, select, or is focused. If blue is decorating, it's wrong — make it slate.

**The One-Neutral Rule.** Slate is the neutral family. Gray (`gray-*` / `zinc-*`) is forbidden going forward; the current `gray-*` usage is legacy drift to migrate, not a pattern to copy. One ramp, no two near-identical neutrals fighting.

## 3. Typography

**Display Font:** Space Grotesk (with sans-serif fallback)
**Body Font:** IBM Plex Sans (with system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, monospace)

**Character:** A geometric display paired with a humanist body — a real contrast axis, not two lookalike sans. Space Grotesk gives headlines a precise, slightly technical edge; IBM Plex Sans keeps body copy warm and highly legible; IBM Plex Mono carries the instrument's voice in labels, meta, and structural captions.

### Hierarchy

- **Display** (Space Grotesk 700, clamp(2.375rem, 5.2vw, 3.875rem), line-height 1.03, tracking -0.02em): Marketing hero headlines only. Use `text-wrap: balance`.
- **Headline** (Space Grotesk 600, ~1.5rem, line-height 1.2): Section and modal titles.
- **Title** (IBM Plex Sans 600, ~1.0625rem, line-height 1.35): Card titles, panel headers, list-item leads.
- **Body** (IBM Plex Sans 400, 1rem, line-height 1.6): Prose and descriptions. Cap measure at 65–75ch; never lighter than Body Slate (#475569).
- **Label** (IBM Plex Mono 500, ~0.6875rem, tracking 0.1em, often UPPERCASE): Toolbar group labels (CONTENT, FIELDS), meta captions, rate-limit/usage counters, technical hints.

### Named Rules

**The Mono-For-Structure Rule.** Mono is reserved for structural/meta text — group labels, counters, file meta, hints. It is the editor's instrument readout. Never set body prose or headlines in mono.

## 4. Elevation

Flat by default. The system conveys depth with hairline slate borders and a single tonal step (Surface Slate off Canvas White), not with shadow. Shadow is a response to state and altitude, not a resting decoration — and it is the technical/restrained kind: tight, low-opacity, slate-tinted. Accent elements may carry a faint colored glow (`shadow-blue-600/30`) to signal "this is the action," but sparingly.

### Shadow Vocabulary

- **Resting** (`box-shadow: 0 1px 2px rgba(15,23,42,0.06)` — shadow-sm): Buttons and inputs at rest, barely there.
- **Lifted** (`box-shadow: 0 10px 15px -3px rgba(15,23,42,0.10)` — shadow-lg): Hovered CTAs, floating toolbars, popovers.
- **Floating** (`box-shadow: 0 25px 50px -12px rgba(15,23,42,0.20)` — shadow-2xl): The document/editor mockup and true overlays only.
- **Action Glow** (`box-shadow: 0 10px 15px -3px rgba(37,99,235,0.30)`): Reserved for the primary CTA. The only colored shadow.

### Named Rules

**The Flat-At-Rest Rule.** Surfaces are flat until the user touches them. Shadow appears on hover, on float, or on focus — never as default chrome. If a card has a shadow sitting idle, flatten it to a slate border.

## 5. Components

### Buttons

- **Shape:** Crisp, technical radii — `lg` (8px) for in-app buttons, `xl` (12px) for marketing CTAs. Never pill-rounded except true status badges.
- **Primary:** Action Blue (#2563eb) fill, white text, 600 weight, `shadow-sm` at rest, fast `transition`. Hover → Action Blue Deep (#1d4ed8). In-app padding ~10px 16px.
- **CTA (marketing):** Larger (14px 24px), `rounded-xl`, `shadow-lg shadow-blue-600/30`, hover lifts `-translate-y-0.5`.
- **Ghost / Secondary:** White fill, Border Slate stroke, Ink text. Hover → border shifts toward Action Blue (border-blue-600/45) with an Action Blue Wash fill. No gray fills.
- **Disabled:** `opacity-50`, no color change.

### Inputs / Fields

- **Style:** White fill, Border Slate (#e2e8f0) 1px stroke, `rounded-md` (6px). Styled via `@tailwindcss/forms`.
- **Focus:** Focus Blue ring (#60a5fa) + border shift to Action Blue. Always visible for keyboard users.
- **Error:** Danger (#b91c1c) border + text, Danger Wash (#fef2f2) fill.

### Cards / Containers

- **Corner Style:** `rounded-xl` (12px); the hero document mock uses `rounded-2xl` (16px).
- **Background:** Canvas White, or Surface Slate for inset/secondary panels.
- **Border:** Border Slate (#e2e8f0) 1px hairline — the primary separation device.
- **Shadow Strategy:** Flat at rest (see Elevation). Shadow only on hover or for true floating surfaces.
- **Internal Padding:** ~24px (lg) on marketing cards; tighter inside the editor.

### Navigation

- **Style:** Minimal top bar, hairline bottom border (Border Slate), Canvas White or Surface Slate background.
- **States:** Inactive items in Body Slate; active/hovered in Ink or Action Blue. Active tool/section marked with Action Blue text or an Action Blue Wash background.
- **Mobile:** Collapse to a compact bar; the canvas always keeps priority.

### Editor Toolbar (signature component)

The instrument's control surface: a low, dense strip on Surface Slate with hairline dividers. UPPERCASE group labels (CONTENT, FIELDS) in a readable mid-slate (#64748b — slate-500, ≥4.5:1) separate tool clusters; the active tool reads in Action Blue, all others in Body Slate. Near-flat, fast, quiet — it should feel like a precise machine panel, never a crowded Acrobat ribbon.

## 6. Do's and Don'ts

### Do:

- **Do** keep Action Blue (#2563eb) on ≤10% of any screen — CTAs, active/selected, focus only. Let slate and white carry everything else.
- **Do** use hairline Border Slate (#e2e8f0) as the default separator and stay flat at rest; reach for shadow only on hover, float, or focus.
- **Do** set body copy at Body Slate (#475569) or darker — never lighter for prose — and verify ≥4.5:1 contrast.
- **Do** reserve IBM Plex Mono for structural/meta text (labels, counters, hints) and Space Grotesk for headlines.
- **Do** give every interactive element a visible Focus Blue (#60a5fa) focus ring and a `prefers-reduced-motion` fallback.
- **Do** keep the Pro/upgrade hue (Pro Violet #6b21a8) visually distinct from Action Blue so "upgrade" never disguises itself as a core action.

### Don't:

- **Don't** be **Adobe-bloated**: no dense multi-row ribbons, no stacked modals, no chrome burying the document.
- **Don't** be a **spammy free-tool site**: no popups, no interstitial upsell, no conversion traps; the free tier must look honest and unwatermarked.
- **Don't** be **generic SaaS**: no gradient-blob heroes, no cream/sand/`--paper` backgrounds, no identical icon-card grids, no tiny tracked-uppercase eyebrow above every section, no `01/02/03` numbered section scaffolding by reflex.
- **Don't** be **cold enterprise**: no sterile all-navy-and-gray B2B dashboard with zero warmth.
- **Don't** mix neutral families — `gray-*`/`zinc-*` is forbidden; slate is the one ramp. Migrate legacy `gray-*` usage, don't extend it.
- **Don't** use blue as decoration, gradient text (`background-clip: text`), colored side-stripe borders (`border-left`/`-right` > 1px), or decorative glassmorphism.
- **Don't** let muted slate (#94a3b8) carry body prose — it's meta/placeholder only.
