# Client-side PDF processing with a metadata usage gate

**Date:** 2026-07-11
**Status:** Approved design, pending implementation plan
**Topic:** Move PDF export and field extraction fully to the browser; monetize via a metadata-only server gate.

## Problem

The app already runs interactive editing and rendering entirely client-side (`pdfjs-dist`). Two operations still send **document bytes** to the server as SvelteKit remote functions:

- `exportPdf` (`src/routes/editor/export.remote.ts`) — builds final PDF bytes via `buildPdf(state)`.
- `extractFields` (`src/routes/editor/extractFields.remote.ts`) — reads AcroForm fields from an uploaded PDF.

We want the product's headline promise to be **"your files never leave your device."** That requires moving both operations to the browser. But `exportPdf` is also the monetization gate: the freemium funnel (anonymous 2/hr, free 5/hr, pro unlimited) works precisely because export routes through a server that counts `usageEvent` rows per identity. Moving processing to the client removes that gate.

**The core tension:** "100% private" forbids sending *document bytes* to the server, but does **not** forbid sending anonymous *metadata* (an "I'm about to export" ping). That metadata seam is how we keep monetizing.

## Decisions

1. **Privacy is the headline differentiator**, not a quiet improvement. The pitch, trust story, and marketing are reframed around it.
2. **Monetization: metadata-only usage gate.** The client processes locally but must first ask the server for permission. The server counts pings per identity (no bytes) and keeps the existing rate limits. This is honor-based / bypassable by a determined user — accepted.
3. **Scope: clean cut.** Move *both* `buildPdf` and field extraction to the client and **delete** the server build paths. No server fallback — no document bytes ever leave the browser.
4. **Error telemetry: anonymous, message-only.** On an unexpected client build failure, send error message + stack + coarse doc shape (counts only) — never document bytes or field values. Disclosed in a privacy note.

## Architecture

| Operation | Today | After |
|---|---|---|
| Interactive edit / render | client (`pdfjs-dist`) | unchanged |
| Field extraction (on upload) | server `extractFields` command | **client** (reuse `mapFields`) |
| Export / build | server `exportPdf` → `buildPdf()` | **client** `buildPdf()` (browser WASM) |
| Usage limits / plan / billing | server, receives bytes | **server, metadata only** |

### Why `build.ts` moves to the client largely as-is

- `@ignaciano3/better-pdf` ships a dedicated browser build (`./dist/index.browser.js`, `--target web` WASM at `pkg-web/better_pdf_core_bg.wasm`). Vite auto-resolves the package's `browser` export condition in the client bundle.
- `PdfDocument.load()` / `.create()` / `.merge()` / `.assemble()` **self-initialize the WASM on first use** (`await initializeWasm()`), so no explicit init is required for correctness.
- **Risk G1 is resolved (not merely mitigated):** `build.ts`'s only *runtime* better-pdf import is the package root (`@ignaciano3/better-pdf`), which has the `browser` condition. Its imports from `@ignaciano3/better-pdf/generate` are all `import type` (erased at compile time), and that subpath's barrel contains no WASM imports anyway ("PdfDocument comes from the package root"). **No upstream library change is needed.**

## Components

### 1. Client field extraction (on upload)

Move the body of the `extractFields` command into a client module (e.g. `src/routes/editor/extract-fields-client.ts`), reusing the existing `mapFields` from `extract-fields.ts`:

```
PdfDocument.load(bytes) → getPages().map(height) → getForm().getFields() → mapFields(...)
```

Same `ExtractFieldsResult` shape (`fields`, `pageHeights`, `allNames`) and the same failure behavior (return empty results on corrupt/encrypted/XFA so the editor still opens for stamping). Delete the `extractFields` remote function.

### 2. The metadata gate — `checkExportAllowance`

New `command` replacing `exportPdf`. Reuses **all** existing server logic — `resolveIdentity`, `resolvePlan`, `countInWindow`, `decide`, and the `usageEvent` insert — but:

- Receives **only** `{ fingerprint }`. No `state`, no bytes.
- Keeps the exact contract on denial: HTTP `429` with `{ reason: 'rate_limited', limit, window, upgradeUrl }`, so the existing `UpsellModal` / rate-limit UI works unchanged.
- On allow: records the `usageEvent` row (metadata only: action, tier, `userId`/`ipHash`, timestamp) and returns success.

**Recording point:** record the event at the allowance check (before the client builds), matching today's "record before build" semantics. Consequence: a rare failed local build still consumes quota — accepted as parity, and it avoids an even softer "record only on success" gate that is trivially bypassed by never calling record.

Because `usageEvent` is still written server-side, the **admin dashboard, billing, and usage analytics keep working unchanged.**

### 3. Client export flow (editor)

1. User clicks Export.
2. `checkExportAllowance({ fingerprint })` → on `429`, show existing upsell UI. Stop.
3. `validateExportInput(state)` (moved client-side) → `buildPdf(state)` locally (lazy WASM).
4. Download via `Blob` + `<a download>`.

`validateExportInput` splits: the state validation runs client-side before build; only `fingerprint` is sent to the gate.

### 4. Error telemetry — `reportExportError`

- `PdfBuildError` (corrupt/encrypted/unsupported input) → surface locally, **not** reported (mirrors today's `logExportError`, which skips `PdfBuildError`).
- Unexpected build failure → surface locally **and** call a new `reportExportError` command sending **only**: error message, stack, and coarse doc shape (page count, field count, whether stamping a source PDF). **Never** document bytes or field values.

## Performance / bundle

The WASM is ~2.1 MB (~700–900 KB gzipped). To protect the "speed you can feel" principle:

- **Dynamic-import** the build path (`build.ts` and its better-pdf dependency) inside the client export handler, so it is not in the initial editor bundle and is never evaluated during SSR.
- **Warm** `initializeWasm()` on an idle callback after the editor mounts, so the first export does not stall on a 2 MB fetch.

## Privacy surface (marketing)

- Prominent, honest **"Your files never leave your device"** statement on the landing page and in the editor.
- A short **privacy note** listing the *only* data sent to the server: anonymous usage pings (to enforce limits) and optional anonymous error reports — explicitly no document content, ever.
- Update `PRODUCT.md` / copy so the promise is stated as fact (it now is).

## Error handling summary

| Situation | Behavior |
|---|---|
| Over rate limit | `429` from `checkExportAllowance` → existing upsell UI; no build |
| Corrupt/encrypted source (`PdfBuildError`) | Local error surface; **not** reported |
| Unexpected build failure | Local error surface **+** anonymous `reportExportError` (no bytes/values) |
| WASM fails to load | Local error surface; no server fallback (clean cut) |
| Corrupt PDF on upload | Extraction returns empty results; editor still opens for stamping |

## Testing

- Keep existing `build.*.test.ts` (validate build logic under node/vitest).
- New: client field-extraction test; adapted allowance-gate server test (from current rate-limit tests, minus bytes); export-flow component test (mock `buildPdf`); error-report classification test (`PdfBuildError` not reported).
- e2e: assert export downloads client-side and **no network request carries PDF bytes** — a direct, testable expression of the privacy promise. Update existing export e2e that assumed a server round-trip.

## Deletions

- `exportPdf` command → replaced by `checkExportAllowance`.
- `extractFields` command → moved to client module.
- Server-side build error logging (`logExportError` on the export path) → replaced by client-triggered `reportExportError`.

## Out of scope

- Server fallback build path (explicitly rejected — clean cut).
- Changing the tiers, prices, or window logic themselves.
- Client-side *cryptographic* enforcement of the gate (the gate is honor-based by design).

## Risks

1. **~~G1: `/generate` browser condition~~ — RESOLVED.** `build.ts` imports `/generate` only as `import type`; its sole runtime better-pdf import is the package root, which has the `browser` condition. No upstream change needed.
2. **SSR must never evaluate the browser WASM glue** — enforced by dynamic-importing the build path inside the client handler (never at module top level in an SSR-evaluated scope).
3. **Gate is bypassable** — accepted. A determined user can call `buildPdf` without the allowance check. Mitigation is friction + honesty, not cryptography.
