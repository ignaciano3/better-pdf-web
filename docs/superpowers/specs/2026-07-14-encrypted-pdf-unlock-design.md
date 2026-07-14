# Encrypted-PDF unlock — design

**Date:** 2026-07-14
**Status:** Approved, pending implementation
**Library:** `@ignaciano3/better-pdf` `1.14.1` (APIs available since 1.7.0 / 1.14.0)

## Problem

The editor cannot open password-protected (encrypted) PDFs. On upload the file
silently fails on all three consumers of the source bytes:

- **pdf.js render** (`renderSourcePdf`, `src/lib/pdf/render.ts`) throws
  `PdfRenderError` → generic "corrupt/encrypted/unsupported" banner.
- **Field extraction** (`extractFieldsFromBytes`, `extract-fields-client.ts`)
  catches the error and returns empty fields.
- **Export** (`build.ts`) would fail later on `PdfDocument.load`.

The library has shipped everything needed to fix this: `isEncrypted()`,
`passwordType()`, and `load(bytes, { password })` — all exported from the
browser entry. Modifying/saving an encrypted doc yields a **decrypted** output
(the library cannot re-encrypt).

## Approach: decrypt-upfront

Detect and decrypt the file **once**, immediately after upload, before any
existing consumer sees the bytes. Store the resulting plaintext bytes as the
source. The entire downstream pipeline (pdf.js render, field extraction, export
build) stays untouched — it only ever handles plaintext.

Rejected alternative: threading a password through every `PdfDocument.load`
call site (render is pdf.js, not better-pdf, so it would need its own password
path too). Far more surface area, more state, more failure modes. Not chosen.

## Components

### 1. `src/routes/editor/decrypt-pdf.ts` (new)

Pure helper, no UI. Signature:

```ts
export class DecryptCancelled extends Error {}

/** Resolve a password, or reject with DecryptCancelled if the user cancels.
 *  `wrongPassword` is true when re-prompting after a failed attempt. */
export type PasswordResolver = (wrongPassword: boolean) => Promise<string>;

/** Returns plaintext bytes. Decrypts in place when the input is encrypted;
 *  returns the input unchanged when it is not. Throws DecryptCancelled if the
 *  user dismisses the prompt. */
export async function decryptIfNeeded(
  bytes: Uint8Array,
  getPassword: PasswordResolver
): Promise<{ bytes: Uint8Array; decrypted: boolean }>;
```

Algorithm:

1. `if (!(await PdfDocument.isEncrypted(bytes))) return { bytes, decrypted: false }`.
2. Try the common owner-locked case: `if ((await PdfDocument.passwordType(bytes, "")) !== null)`
   → decrypt with `""` **silently**, return `{ bytes: plaintext, decrypted: true }`.
3. Otherwise loop, starting with `wrongPassword = false`:
   - `const pw = await getPassword(wrongPassword)` (rejects → propagate `DecryptCancelled`).
   - `if ((await PdfDocument.passwordType(bytes, pw)) === null)` → set `wrongPassword = true`, continue.
   - Else decrypt with `pw`, return `{ bytes: plaintext, decrypted: true }`.

Decryption itself: `const doc = await PdfDocument.load(bytes, { password }); return await doc.save(<save-mode-TBD>);`
Wrap `load` in try/catch as defense in depth — `IncorrectPasswordError` is
treated the same as a `null` `passwordType` (re-prompt); other `PdfError`s
propagate to the caller's existing error path.

**⚠ Open question (resolve FIRST — see Implementation step 0):** the library
docs say saving an *edited* encrypted PDF produces decrypted output. It is
**not confirmed** that a bare no-op `save()` decrypts — an incremental
append-only save may round-trip the original encrypted bytes, yielding output
that is still encrypted (or a broken plaintext-over-encrypted hybrid). A full
rebuild via `copyPages` is guaranteed plaintext but **drops interactive
AcroForm fields** (bakes them to appearance), which breaks the fill use-case.
The exact `save` mode used by `decryptIfNeeded` must be chosen empirically so
that the output is (a) not encrypted and (b) still carries fillable fields.

### 2. `src/routes/editor/PasswordPromptModal.svelte` (new)

Matches the existing modal pattern (`DocumentPropertiesModal.svelte`,
`FieldPropertiesModal.svelte`). Props: `open`, `wrongPassword`. Emits/binds a
password `submit` and a `cancel`. Contents: a password `<input type="password">`,
an inline error line shown when `wrongPassword`, and Unlock / Cancel buttons.
Enter submits; Escape / Cancel dismisses.

### 3. `editor.svelte.ts` wiring

- New reactive state: `passwordPrompt: { wrongPassword: boolean; resolve: (pw: string) => void; reject: () => void } | null = $state(null)`, and `wasDecrypted = $state(false)`.
- A method `#requestPassword: PasswordResolver = (wrongPassword) => new Promise((resolve, reject) => { this.passwordPrompt = { wrongPassword, resolve, reject }; })`.
  The modal's submit calls `resolve(pw)` then clears `passwordPrompt`; cancel
  calls `reject()` (→ `DecryptCancelled`) then clears it.
- In **`loadPdf`** and **`appendPdf`**: immediately after reading
  `bytes = new Uint8Array(await file.arrayBuffer())`, call
  `const { bytes: plain, decrypted } = await decryptIfNeeded(bytes, this.#requestPassword);`
  Use `plain` everywhere the raw `bytes` were used (render, `exportCopy`,
  `sources`, field extraction). Set `this.wasDecrypted ||= decrypted`.
- Catch `DecryptCancelled` in the `try/catch`: clear loading state and abort
  **without** setting `errorMessage` (user chose to cancel — not an error).
- `clearSource()` resets `wasDecrypted = false` and `passwordPrompt = null`.

### 4. Export notice

When `wasDecrypted` is true, show a one-line notice in the export UI (near the
existing export toggles): "The exported PDF will not be password-protected."
Display only; does not block export.

### 5. Modal mount

Render `PasswordPromptModal` from the editor page (`+page.svelte`, alongside the
other modals), bound to the editor's `passwordPrompt` state.

## Data flow

```
file → arrayBuffer → decryptIfNeeded(bytes, requestPassword)
                        │  isEncrypted? ─no→ passthrough
                        │  yes → passwordType("")≠null → decrypt silently
                        │        else → modal loop → decrypt
                        ▼
                  plaintext bytes ──→ renderSourcePdf (pdf.js)
                                  ──→ exportCopy → sources[i]
                                  ──→ extractFieldsFromBytes (better-pdf)
                                  ──→ (later) build.ts export
```

## Error handling

| Case | Behavior |
|------|----------|
| Not encrypted | Passthrough, no prompt, `decrypted: false`. |
| Owner-locked / empty user pw | Silent decrypt with `""`. |
| Correct user password | Decrypt, `wasDecrypted = true`. |
| Wrong password | `passwordType` / `IncorrectPasswordError` → re-prompt with error line. |
| User cancels modal | `DecryptCancelled` → abort load silently, no banner. |
| Other load/save failure | Propagates to existing `errorMessage` path. |

## Implementation step 0 — verify decrypt semantics (blocking)

Before building anything else, write a throwaway probe (or the first test)
against an encrypted, **form-bearing** fixture that establishes which
`PdfDocument.load(bytes,{password}).save(...)` path yields output that is both
`isEncrypted(output) === false` **and** still exposes fillable fields via
`getForm().getFields()`. Candidate paths, in preference order:

1. Bare `doc.save()`.
2. Metadata-touch then save (e.g. `doc.setModificationDate(new Date())` — pass
   a `Date` in; note scripts elsewhere avoid `new Date()`, but this is app code)
   then `doc.save()`.
3. `doc.save({ objectStreams: true })` (forces full rebuild).
4. Fallback only if 1–3 fail to preserve fields: accept baked (non-interactive)
   fields for encrypted docs and document the limitation.

Lock the winning path into `decryptIfNeeded` and delete the probe. The unit
tests below then assert that invariant.

## Testing

`src/routes/editor/decrypt-pdf.test.ts` (Vitest, matching existing test style),
using small encrypted fixtures:

- Non-encrypted input → returned unchanged, `decrypted: false`, resolver never called.
- Owner-locked (empty-password) file → decrypted silently, resolver never called, output opens unencrypted.
- User-password file, correct password → resolver called once, decrypted output opens.
- User-password file, wrong then correct → resolver called with `wrongPassword: true` on the 2nd call, eventually decrypts.
- Resolver rejects (cancel) → `decryptIfNeeded` rejects with `DecryptCancelled`.

Fixtures: generate encrypted PDFs (or add to `tests/fixtures/…`) — reuse the
library's fixture approach if usable, otherwise create minimal ones. Verify the
decrypted output is no longer encrypted (`isEncrypted(output) === false`).

## Out of scope

- Producing encrypted output (library does not support re-encryption).
- Reading XFA forms (separate, already-rejected input class).
- Persisting or remembering passwords across sessions.
