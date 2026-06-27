# Critique ignore list

Findings listed here are dropped silently on future critique runs.

- **gray-on-color @ `src/routes/editor/Canvas.svelte` "+ Add page" button** — false positive. The base `text-slate-500` only sits on `bg-white/50`; the `hover:bg-blue-50` is paired with `hover:text-blue-600`, so slate text never renders on the blue wash. Contrast passes in both states.
- **gray-on-color @ `src/routes/+page.svelte` "Edit existing PDF" ghost button** — false positive. `text-slate-900` is the resting color on a white fill; `bg-blue-50/60` only appears on hover, where slate-900 on blue-50 stays well above 4.5:1. The detector pairs the resting text color with the hover background.
