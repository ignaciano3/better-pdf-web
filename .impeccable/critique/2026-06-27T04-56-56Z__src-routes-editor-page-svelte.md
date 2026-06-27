---
target: editor
total_score: 27
p0_count: 0
p1_count: 0
timestamp: 2026-06-27T04-56-56Z
slug: src-routes-editor-page-svelte
---

# Critique: Editor (`src/routes/editor/+page.svelte`) — re-score

## Design Health Score

| #         | Heuristic                       | Score     | Δ      | Key Issue                                                                                   |
| --------- | ------------------------------- | --------- | ------ | ------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 2         | –      | No save/autosave state, no "files auto-delete ~2h" notice; undo/redo depth now visible      |
| 2         | Match System / Real World       | 3         | –      | AcroForm jargon (Combo box, List box) still unexplained                                     |
| 3         | User Control and Freedom        | 3         | +1     | Undo/redo + Cmd/Z added; but clear-source is unrecoverable, no destructive confirms         |
| 4         | Consistency and Standards       | 4         | +2     | Dual Export resolved (single FAB); gray→slate unified to one neutral family                 |
| 5         | Error Prevention                | 2         | –      | Still no confirm on clear-source / delete-page (undo mitigates as recovery, not prevention) |
| 6         | Recognition Rather Than Recall  | 3         | –      | Page-panel icons now legible (slate-500) but still title-only                               |
| 7         | Flexibility and Efficiency      | 2         | +1     | First keyboard accelerators (Ctrl/Cmd+Z, Shift+Z, Ctrl+Y); no tool shortcuts/bulk yet       |
| 8         | Aesthetic and Minimalist Design | 3         | +1     | Empty state now single-focus; one primary Export; no more 16-tool wall on first impression  |
| 9         | Error Recovery                  | 3         | –      | Messages still good (specific, reassuring); undo adds a recovery net                        |
| 10        | Help and Documentation          | 2         | –      | Shortcut tooltips/aria added; still no first-run help                                       |
| **Total** |                                 | **27/40** | **+5** | **Acceptable (upper end, nearing Good)**                                                    |

## Anti-Patterns Verdict

**LLM:** Low slop, and now noticeably more finished. The first-impression wall is gone (empty state = Upload + card only), there's one unmistakable primary action (the glowing Export FAB), and the neutral family is unified slate. Reads as a calmer instrument — closer to the "Quiet Workbench" North Star.

**Deterministic scan:** clean. The sole detector hit (`gray-on-color` at `Canvas.svelte:164`) is the documented false positive in `ignore.md` (the "+ Add page" button recolors text to blue on the blue hover wash).

**Visual evidence:** empty state and blank-canvas screenshots. Single Export, undo/redo present (disabled at rest), no functional horizontal scrollbar (inert gutter only).

## What's Working

- **Single-focus empty state** — the toolbar collapses to Upload; the centered card carries the one decision. Strong activation surface.
- **One discoverable Export (FAB)** — icon + glow, close to the work, no longer competing with the header's blue Sign-up.
- **Undo/redo with keyboard** — reactive history, coalesced steps, Cmd/Z + redo; the biggest User-Control gain.
- **Unified slate + Action Blue** — the One-Neutral and Action-Blue rules now hold in the editor.

## Priority Issues (remaining)

**[P2] No persistence/retention signal.** Nothing tells the user their work is held only in-browser or that files auto-delete (~2h per PRD). For a "trust through clarity" brand this is a missing reassurance and a status gap. Fix: a quiet status line ("Not saved — stays in your browser") and/or a one-time retention note. → `/impeccable clarify` or `/impeccable onboard`.

**[P2] Destructive actions lack a net.** "New blank" / clear-source wipes the document and resets history (unrecoverable), with no confirm. Delete-page has no confirm (undo covers it now, but clear-source doesn't). Fix: confirm on clear-source, or make it undoable. → `/impeccable harden`.

**[P2] Page-panel controls are icon-only.** The ↑↓⟳🗑 thumbnail controls rely on `title` tooltips; keyboard/screen-reader users (Sam) get little. Fix: `aria-label`s + visible focus, 44px hit areas. → `/impeccable audit` / `/impeccable harden`.

**[P3] No tool keyboard shortcuts.** Only undo/redo are keyboard-accessible; power users (Alex) still mouse every tool. Fix: T/R/L/etc. accelerators. → `/impeccable harden`.

**[P3] Empty-state card is generic.** No drag-and-drop affordance is signaled even though the canvas could accept a drop. → `/impeccable onboard`.

## Persona Red Flags (remaining)

**Alex (power user):** undo/redo shortcuts now exist, but no tool/bulk shortcuts.
**Sam (accessibility):** page-panel icon controls still title-only; active tool still color-only.
**Mara (task-driven, from PRODUCT.md):** empty state is now clear and single-focus — big improvement. Still meets unexplained "Combo box/List box" once editing, but the entry path is much smoother.

## Minor Observations

- "files auto-delete" trust note would double as a status and a brand signal.
- Active-tool state is conveyed by blue fill alone (add a non-color cue for color-blind users).

## Questions to Consider

- What's the smallest status line that tells the user their work is safe (and ephemeral)?
- Should clear-source be undoable rather than a hard reset?
