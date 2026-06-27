# Product

## Register

product

## Users

People who need to fill, edit, or assemble PDFs without installing desktop software — knowledge workers, freelancers, and small-business operators handling forms, contracts, signatures, and document assembly in the browser. They arrive task-driven (one document, one job: fill this form, sign this, merge these, reorder pages) and often under mild time pressure. Skill level ranges from non-technical to power users; the editor must not intimidate the former or slow down the latter.

Secondary: developers/evaluators who land via the `better-pdf` library and use the app as a live demo of what the library can do.

## Product Purpose

A client-heavy, server-gated visual PDF editor (Sejda-like) that lets anyone edit and create PDFs directly in the browser. Interactive editing runs entirely client-side (free, no server cost); only finalize/export and heavy operations route through a server gate (identity → plan → rate-check → finalize). It also dogfoods the `better-pdf` library.

Success looks like: a user completes their document task and exports without friction, hits no spam/upsell walls, and trusts the result enough to send it. Monetization is a freemium funnel (anon → registered free → pro) where the free tier is genuinely useful and never watermarks output — the upgrade is earned by volume and heavy features, not by crippling the base experience.

## Brand Personality

Fast, precise, trustworthy. The voice is calm and competent — a serious utility that respects the user's time and gets out of the way. No hype, no dark patterns, no exclamation-mark marketing. Confidence comes from clarity and responsiveness, not decoration. When the product speaks (labels, errors, hints), it is direct, specific, and reassuring.

## Anti-references

- **Adobe Acrobat / legacy PDF software**: bloated, cluttered, modal-heavy, slow-feeling, too much chrome.
- **SmallPDF / iLovePDF-style free-tool sites**: ad-ridden, popup-heavy, conversion-trap freemium; never make the user feel hunted.
- **Generic SaaS template**: gradient-blob heroes, cream/sand body backgrounds, identical 3-card icon grids, tiny tracked-uppercase eyebrows above every section, numbered section scaffolding by reflex.
- **Cold enterprise B2B**: sterile navy-and-gray dashboard with no personality or warmth.

## Design Principles

1. **The tool gets out of the way.** Chrome is minimal; the document is the hero. Every pixel of UI must earn its place against the canvas. Precision over ornament.
2. **Speed is a feature you can feel.** Interactions are instant and direct (client-side editing). Motion confirms and orients; it never gates content or adds latency.
3. **Never make the user feel hunted.** The free tier is honest and unwatermarked. Upgrade prompts are contextual and respectful, surfaced at the moment of real need — not popups, not guilt.
4. **Trust through clarity.** Direct labels, specific errors, honest empty/limit states. The user always knows what will happen before it happens (especially at the export gate).
5. **Approachable depth.** Powerful enough for power users, calm enough for first-timers. Progressive disclosure: simple by default, capability on demand.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥4.5:1 contrast (≥3:1 for large text), visible keyboard focus on all interactive elements, full keyboard navigation, and a `prefers-reduced-motion` alternative for every animation. Editor overlay/annotation colors should remain distinguishable for color-blind users (don't rely on hue alone). Respect system dark/light where feasible.
