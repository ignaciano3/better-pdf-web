# Critique ignore list

Findings listed here are dropped silently on future critique runs.

- **gray-on-color @ `src/routes/editor/Canvas.svelte` "+ Add page" button** — false positive. The base `text-slate-500` only sits on `bg-white/50`; the `hover:bg-blue-50` is paired with `hover:text-blue-600`, so slate text never renders on the blue wash. Contrast passes in both states.
