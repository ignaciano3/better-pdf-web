---
target: editor
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-06-27T05-26-17Z
slug: src-routes-editor-page-svelte
---
# Critique: Editor (`src/routes/editor/+page.svelte`) — re-score (3rd run)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of System Status | 3 | +1 | "Unsaved" status + beforeunload now communicate persistence; no server-retention note |
| 2 | Match System / Real World | 3 | – | AcroForm jargon (Combo box, List box) still unexplained |
| 3 | User Control and Freedom | 4 | +1 | Undo/redo + Cmd/Z + confirm-before-discard + escapes everywhere |
| 4 | Consistency and Standards | 4 | – | Single Export, unified slate, shared modal pattern |
| 5 | Error Prevention | 3 | +1 | Confirm on discard + beforeunload guard; delete-page still relies on undo |
| 6 | Recognition Rather Than Recall | 3 | – | Page-panel controls now labeled + focus-ringed (helps assistive tech) |
| 7 | Flexibility and Efficiency | 2 | – | Undo/redo shortcuts only; no tool shortcuts or bulk ops |
| 8 | Aesthetic and Minimalist Design | 3 | – | Single-focus empty state; editing toolbar still full (by choice) |
| 9 | Error Recovery | 3 | – | Clear messages; undo + reassuring upsell |
| 10 | Help and Documentation | 2 | – | Control tooltips/labels; no first-run help |
| **Total** | | **30/40** | **+3** | **Good — solid foundation** |

## Anti-Patterns Verdict

**LLM:** Low slop, now a coherent and trustworthy tool. The session moved it from "functionally rich but unfinished" to "finished": single-focus entry, one primary action, unified slate, honest persistence signals, full undo/redo, and labeled accessible controls. Reads clearly as the "Quiet Workbench."

**Deterministic scan:** clean — only the documented false positive (`Canvas.svelte:164`, "+ Add page" hover) which is in `ignore.md`.

**Visual evidence:** empty + editing screenshots; no regressions.

## What's Working

- **Honest persistence** — "Unsaved" status + beforeunload + confirm-before-discard close the data-loss gaps without dark patterns.
- **Undo/redo + destructive confirms** — strong, forgiving control surface.
- **Single-focus empty state + one Export FAB** — clear activation and a single primary action.
- **Accessible page controls** — descriptive labels, focus rings, unified slate.

## Priority Issues (remaining — all P3)

**[P3] No tool keyboard shortcuts.** Only undo/redo are keyboard-driven; power users (Alex) still mouse every tool. Fix: single-key tool accelerators (T/R/L/…), shown in tooltips. → `/impeccable harden`.

**[P3] No first-run help / empty-card affordance.** The empty card doesn't signal drag-and-drop, and there's no lightweight guidance for first-timers (Mara) on what the tools do. → `/impeccable onboard`.

**[P3] Active-tool state is color-only.** The selected insert tool is conveyed by blue fill alone; add a non-color cue (weight/underline/checkmark) for color-blind users. → `/impeccable audit`.

**[P3] Server-retention note.** A small "files you export are processed server-side and auto-deleted" line would complete the trust story. → `/impeccable clarify`.

## Persona Red Flags (remaining)

**Alex:** undo/redo shortcuts exist; tool/bulk shortcuts still missing.
**Sam:** page controls fixed; active-tool color-only cue remains.
**Mara:** entry flow now smooth and guarded; AcroForm jargon still appears once editing.

## Questions to Consider

- What's the minimal set of tool keyboard shortcuts that would satisfy power users without complicating the basics?
- Is a first-run hint worth it, or does the labeled toolbar already teach enough?
