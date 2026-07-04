# File-size optimization toggle + collapsed export passes

Date: 2026-07-04
Library bump: `@ignaciano3/better-pdf` 1.8.0 → 1.10.0

## Motivation

The 1.10.0 release adds two output-size features to `save()`:

- **Deflate stream compression** — default `true`, backward-compatible. Already
  active after the bump; no code change needed, exports are already smaller.
- **Object streams** (`save({ objectStreams: true })`) — packs non-stream
  objects into object streams + xref streams. Full-document save paths only.
  Forces PDF 1.5+ and is **not PDF/A-1 conformant**, so it must be user-opt-in.

The 1.9.0 release makes `getForm()` work on a `create()`d document in the same
session (no save-and-reload round-trip). This lets us collapse the export's
extra serialize passes and — critically — makes the `objectStreams` option
actually reach flattened output.

This spec covers two coupled changes. It explicitly does **not** touch the D3
"always rebuild" export architecture (that was a separate, larger idea).

## Part A — "Optimize file size" export toggle

### UX

A second checkbox in `DocumentPropertiesModal.svelte`, directly under the
existing "Flatten fields on export" checkbox, bound to a new editor store field
`optimizeSize` (default `false`). Because the trade-off is non-obvious, an
inline helper line sits under the label (inline text, not a hover `title`, so it
is visible on touch devices):

```
☐ Optimize file size (smaller file, PDF 1.5+)
    Packs the PDF's internal objects into compressed streams, producing a
    noticeably smaller file. Requires a PDF 1.5+ reader (all modern viewers)
    and is not suitable for PDF/A archival.
```

Off by default means existing users' output is byte-for-byte unchanged unless
they opt in.

### Data flow

`optimizeSize` mirrors the exact path `flatten` already travels:

| Location | Change |
| --- | --- |
| `editor.svelte.ts:83` (state interface) | add `optimizeSize: boolean` |
| `editor.svelte.ts:206` (field) | `optimizeSize = $state(false)` |
| `editor.svelte.ts:289` (reactive track) | `void this.optimizeSize` |
| `editor.svelte.ts:322` (history snapshot) | include `optimizeSize` |
| `editor.svelte.ts:350` (history restore) | `this.optimizeSize = c.optimizeSize` |
| `editor.svelte.ts:1508` (export state) | `...(this.optimizeSize ? { objectStreams: true } : {})` |
| `types.ts` (`EditState`) | add `objectStreams?: boolean` |
| `export-validate.ts:394` | boolean-type guard beside the `flatten` guard |
| `build.ts` | thread into the final `save({ objectStreams })` |
| `DocumentPropertiesModal.svelte:78` | add checkbox + helper text |

The transport uses the `EditState` field name `objectStreams` (matches the lib
option); the editor-store / UI name is `optimizeSize` (user-facing framing).

### Deflate compression

Left always-on (lib default). It is backward-compatible — only smaller output —
so it needs no toggle and no code change.

## Part B — collapse the extra export save passes

### Current behavior

`buildPdf` can serialize up to three times:

1. `buildSourceRebuild` / `buildBlankRebuild` → `save()`
2. `applyMultiSelections` — `load()` → `getForm()` → `selectMultiple` → `save()`
3. `flattenAllFields` — `load()` → `getForm()` → `flatten()` → `save()`

Passes 2 and 3 exist only because, pre-1.9.0, `getForm()` did not work on a
`create()`d document.

### New behavior

Do multi-select and flatten in the same session as the build, before a single
final `save()`. The seam is `finishDoc` (shared by both build paths):

```
create → embed pages → draw stamps → author fields (createForm)
       → getForm()                       // first call SEALS the doc
            → selectMultiple(...)          // multi-select listboxes
            → flatten()                    // only when state.flatten && hasFields
       → save({ objectStreams })           // single serialize
```

Ordering constraints, both satisfied above:

- `getForm()` seals the document on first call — no drawing/field-authoring
  after it. All drawing and `createForm()` authoring already complete before
  `finishDoc` reaches the form step.
- Multi-select must run **before** flatten so the selected appearance is baked
  into the flattened content.

`getForm()` is called only when there is form work to do (multi-selections
present, or `flatten` requested with fields). A document with fields but no such
work skips `getForm()` entirely, leaving it unsealed and interactive.

### Removals

- `applyMultiSelections` (build.ts) — deleted; logic moves in-session.
- `flattenAllFields` (build.ts) — deleted; logic moves in-session.
- `collectMultiSelections` — retained; still used to gather the selections, now
  consumed in-session inside `finishDoc`.

### Consolidation

Multi-select gathering + application and flatten move into `finishDoc` so both
the blank and source build paths share one code path. `buildPdf` no longer runs
the post-passes; it just returns the finished bytes.

### Synergy with Part A

`flattenAllFields` was an incremental `load()` → `save()` pass, which ignores
`objectStreams` (incremental saves are append-only). Moving flatten in-session
makes the final save a full-document create-path save, so `objectStreams`
reaches flattened output. Without Part B, the Part A toggle would silently
no-op whenever flatten is enabled.

## Testing

- Existing suites are the regression net: `build.flatten.test.ts`,
  `build.field.test.ts`, and the multi-select coverage in `build.test.ts` /
  `build.pageops.test.ts`. All must stay green after the pass-collapse.
- Add coverage:
  - `objectStreams: true` export re-loads via `PdfDocument.load` and its fields
    round-trip (name/type/value preserved).
  - `objectStreams: true` **with** `flatten: true` produces a valid, re-loadable
    PDF with no interactive AcroForm.
  - Multi-select initial selections survive the in-session path (a listbox with
    `multiSelect` + `selectedValues` reads back the selected values), matching
    the pre-change output.
- `export-validate.ts`: a non-boolean `objectStreams` is rejected (mirror the
  existing `flatten` validation test).

## Out of scope

- Feature #3 "reconsider the always-rebuild (D3) architecture" using 1.9.0's
  `createForm()`-on-loaded — a separate, larger change.
- Exposing deflate compression as a toggle (it is always-on and backward
  compatible).
