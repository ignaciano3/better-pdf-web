# Encrypted-PDF Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the editor open password-protected (encrypted) PDFs by decrypting them once on upload, so render, field extraction, and export all work on plaintext.

**Architecture:** A single `decryptIfNeeded` helper runs immediately after a file is read, before any existing consumer touches the bytes. It detects encryption (`isEncrypted`), silently handles owner-locked files (empty password), prompts the user via a modal for user-password files, and returns decrypted plaintext bytes. Everything downstream is unchanged.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, `@ignaciano3/better-pdf` `1.14.1` (WASM), Vitest, Tailwind. Package manager: **bun**.

## Global Constraints

- Use **bun**, never npm/pnpm (`CLAUDE.md`). Run a single test file with `bunx vitest run <path>`.
- Bytes never leave the browser — all decryption is client-side WASM.
- The library **cannot** produce encrypted output; decrypted export is expected and must be disclosed to the user.
- Owner-locked / empty-user-password files must open **silently** (no prompt).
- Unlock must work on **both** `loadPdf` (primary) and `appendPdf` (merge) uploads.
- User-cancel of the password prompt aborts the load **without** an error banner.
- Encryption APIs are static on `PdfDocument`: `isEncrypted(input)`, `passwordType(input, password)`, `load(input, { password })`. Error classes `EncryptedPdfError`, `IncorrectPasswordError` are exported from `@ignaciano3/better-pdf`.

---

## File Structure

- Create: `scripts/make-encrypted-fixtures.ts` — one-time fixture generator (needs system `qpdf`).
- Create: `src/routes/editor/fixtures/*.pdf` — committed base + encrypted fixtures (binary, generated once).
- Create: `src/routes/editor/decrypt-pdf.ts` — `decryptIfNeeded`, `DecryptCancelled`, `PasswordResolver`.
- Create: `src/routes/editor/decrypt-pdf.test.ts` — node Vitest for the helper.
- Create: `src/routes/editor/PasswordPromptModal.svelte` — password prompt UI.
- Create: `src/routes/editor/PasswordPromptModal.svelte.test.ts` — jsdom render/interaction test.
- Modify: `src/routes/editor/editor.svelte.ts` — state (`passwordPrompt`, `wasDecrypted`), `#requestPassword`, `loadPdf`, `appendPdf`, `clearSource`.
- Modify: `src/routes/editor/+page.svelte` — mount `PasswordPromptModal`.
- Modify: `src/routes/editor/DocumentPropertiesModal.svelte` — one-line "will not be password-protected" notice when `wasDecrypted`.

---

## Task 1: Generate and commit encrypted test fixtures

The library cannot create encrypted PDFs and there is no `qpdf`/`pdftk` in the repo or CI. Generate the fixtures **once** locally with system `qpdf` and commit the resulting files so tests (and CI) need no external tool.

**Files:**
- Create: `scripts/make-encrypted-fixtures.ts`
- Create (generated, committed): `src/routes/editor/fixtures/form-plain.pdf`, `form-owner-locked.pdf`, `form-user-pw.pdf`

**Interfaces:**
- Produces: three committed fixture files consumed by Task 2's tests:
  - `form-plain.pdf` — unencrypted, has one text field named `full_name`.
  - `form-owner-locked.pdf` — encrypted, **empty** user password (opens with `""`), same field.
  - `form-user-pw.pdf` — encrypted, user password `secret`, same field.

- [ ] **Step 1: Install qpdf (one-time, local only)**

Run: `qpdf --version` — if missing, `sudo dnf install -y qpdf` (Fedora). Not needed in CI.
Expected: prints a version.

- [ ] **Step 2: Write the fixture generator**

Create `scripts/make-encrypted-fixtures.ts`:

```ts
/**
 * One-time fixture generator for encrypted-PDF unlock tests. Requires system
 * `qpdf`. Run with: `bun scripts/make-encrypted-fixtures.ts` (bun runs TS natively).
 * Commit the produced files under src/routes/editor/fixtures/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PdfDocument } from '@ignaciano3/better-pdf';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../src/routes/editor/fixtures');
mkdirSync(outDir, { recursive: true });

// Base: a one-page form with a single text field named `full_name`.
const doc = await PdfDocument.create();
doc.addPage([595.28, 841.89]);
doc
  .createForm()
  .addTextField('full_name', { page: 0, x: 56, y: 700, width: 240, height: 22 });
const plain = await doc.save();
const plainPath = join(outDir, 'form-plain.pdf');
writeFileSync(plainPath, plain);

// Encrypt with qpdf. Owner password is arbitrary; user password controls open.
// Owner-locked: empty user password → opens with "".
execFileSync('qpdf', [
  '--encrypt', '', 'owner-secret', '256', '--',
  plainPath, join(outDir, 'form-owner-locked.pdf')
]);
// User-password: must supply "secret" to open.
execFileSync('qpdf', [
  '--encrypt', 'secret', 'owner-secret', '256', '--',
  plainPath, join(outDir, 'form-user-pw.pdf')
]);

console.log('Fixtures written to', outDir);
```

> Note: verify the exact `createForm().addTextField` signature against `node_modules/@ignaciano3/better-pdf/README.md` (search "addTextField") before running; adjust the option keys (`page`, `rect`) if the README differs. The field name `full_name` is the contract the tests rely on.

- [ ] **Step 3: Generate the fixtures**

Run: `bun scripts/make-encrypted-fixtures.ts`
Expected: "Fixtures written to …/fixtures" and three `.pdf` files exist.

- [ ] **Step 4: Sanity-check the fixtures with qpdf**

Run: `qpdf --show-encryption src/routes/editor/fixtures/form-owner-locked.pdf`
Expected: reports encryption present, "user password: " empty.
Run: `qpdf --show-encryption src/routes/editor/fixtures/form-user-pw.pdf`
Expected: reports encryption present (user password required).

- [ ] **Step 5: Commit**

```bash
git add scripts/make-encrypted-fixtures.ts src/routes/editor/fixtures/
git commit -m "test: add encrypted-PDF fixtures + generator for unlock feature"
```

---

## Task 2: `decrypt-pdf.ts` core helper

Contains the empirical save-mode decision (spec Step 0) and the detect/decrypt logic. No UI, no Svelte — plain module + node Vitest against the Task 1 fixtures.

**Files:**
- Create: `src/routes/editor/decrypt-pdf.ts`
- Test: `src/routes/editor/decrypt-pdf.test.ts`

**Interfaces:**
- Consumes: Task 1 fixtures; `PdfDocument` from `@ignaciano3/better-pdf`.
- Produces (relied on by Task 4):
  - `class DecryptCancelled extends Error`
  - `type PasswordResolver = (wrongPassword: boolean) => Promise<string>`
  - `async function decryptIfNeeded(bytes: Uint8Array, getPassword: PasswordResolver): Promise<{ bytes: Uint8Array; decrypted: boolean }>`

- [ ] **Step 1: Write the characterization test for the save mode (spec Step 0)**

This test asserts the invariant the implementation must satisfy: decrypted output is **not** encrypted **and** still exposes the field. It drives the choice of save mode. Create `src/routes/editor/decrypt-pdf.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { decryptIfNeeded, DecryptCancelled } from './decrypt-pdf';

const dir = join(__dirname, 'fixtures');
const bytesOf = (f: string) => new Uint8Array(readFileSync(join(dir, f)));
const never: () => Promise<string> = () => {
  throw new Error('resolver should not be called');
};

async function fieldNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PdfDocument.load(bytes);
  return (doc.getForm().getFields() as Array<{ name: string }>).map((f) => f.name);
}

describe('decryptIfNeeded — decrypted output invariant', () => {
  it('owner-locked file decrypts to plaintext that still has the field', async () => {
    const { bytes, decrypted } = await decryptIfNeeded(bytesOf('form-owner-locked.pdf'), never);
    expect(decrypted).toBe(true);
    expect(await PdfDocument.isEncrypted(bytes)).toBe(false);
    expect(await fieldNames(bytes)).toContain('full_name');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/routes/editor/decrypt-pdf.test.ts`
Expected: FAIL — module `./decrypt-pdf` has no `decryptIfNeeded` export.

- [ ] **Step 3: Implement `decrypt-pdf.ts` (bare-save first)**

Create `src/routes/editor/decrypt-pdf.ts`:

```ts
import { PdfDocument } from '@ignaciano3/better-pdf';

/** Thrown when the user dismisses the password prompt. Callers abort silently. */
export class DecryptCancelled extends Error {
  constructor() {
    super('Password entry cancelled');
    this.name = 'DecryptCancelled';
  }
}

/**
 * Resolve a password for an encrypted PDF. `wrongPassword` is true when
 * re-prompting after a failed attempt. Reject with `DecryptCancelled` when the
 * user cancels.
 */
export type PasswordResolver = (wrongPassword: boolean) => Promise<string>;

/** Load with the given password and re-serialize to decrypted plaintext bytes. */
async function toPlaintext(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const doc = await PdfDocument.load(bytes, { password });
  return await doc.save();
}

/**
 * Return plaintext bytes for a possibly-encrypted PDF. Non-encrypted input is
 * returned unchanged. Owner-locked / empty-user-password files decrypt silently.
 * Otherwise `getPassword` is called (and re-called on wrong passwords) until a
 * valid password is supplied or the user cancels (→ `DecryptCancelled`).
 */
export async function decryptIfNeeded(
  bytes: Uint8Array,
  getPassword: PasswordResolver
): Promise<{ bytes: Uint8Array; decrypted: boolean }> {
  if (!(await PdfDocument.isEncrypted(bytes))) {
    return { bytes, decrypted: false };
  }
  // Owner-locked / empty-user-password: opens with "".
  if ((await PdfDocument.passwordType(bytes, '')) !== null) {
    return { bytes: await toPlaintext(bytes, ''), decrypted: true };
  }
  let wrongPassword = false;
  // Loop until a valid password or cancel (which rejects out of this function).
  for (;;) {
    const pw = await getPassword(wrongPassword);
    if ((await PdfDocument.passwordType(bytes, pw)) === null) {
      wrongPassword = true;
      continue;
    }
    try {
      return { bytes: await toPlaintext(bytes, pw), decrypted: true };
    } catch {
      // Defensive: treat any decrypt failure as a wrong password and re-prompt.
      wrongPassword = true;
    }
  }
}
```

- [ ] **Step 4: Run the characterization test**

Run: `bunx vitest run src/routes/editor/decrypt-pdf.test.ts`
Expected: PASS.

**If it FAILS on `isEncrypted(bytes) === false`** (bare `save()` round-tripped the encryption): change `toPlaintext` to force a rewrite by touching metadata before save:

```ts
async function toPlaintext(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const doc = await PdfDocument.load(bytes, { password });
  doc.setModificationDate(new Date()); // benign edit → non-incremental decrypted output
  return await doc.save();
}
```

Re-run. **If it then FAILS on the field assertion**, try `doc.save({ objectStreams: true })` instead (full rebuild). Record the winning mode in a one-line code comment above `toPlaintext`. Do not proceed until this test is green.

- [ ] **Step 5: Add the remaining behavior tests**

Append to `src/routes/editor/decrypt-pdf.test.ts`:

```ts
describe('decryptIfNeeded — behavior', () => {
  it('returns non-encrypted input unchanged, never calling the resolver', async () => {
    const input = bytesOf('form-plain.pdf');
    const resolver = vi.fn(never);
    const { bytes, decrypted } = await decryptIfNeeded(input, resolver);
    expect(decrypted).toBe(false);
    expect(bytes).toBe(input); // same reference, no copy
    expect(resolver).not.toHaveBeenCalled();
  });

  it('decrypts a user-password file with the correct password', async () => {
    const resolver = vi.fn(async () => 'secret');
    const { bytes, decrypted } = await decryptIfNeeded(bytesOf('form-user-pw.pdf'), resolver);
    expect(decrypted).toBe(true);
    expect(await PdfDocument.isEncrypted(bytes)).toBe(false);
    expect(await fieldNames(bytes)).toContain('full_name');
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(false);
  });

  it('re-prompts with wrongPassword=true after a bad password', async () => {
    const resolver = vi
      .fn<PasswordResolver>()
      .mockResolvedValueOnce('nope')
      .mockResolvedValueOnce('secret');
    const { decrypted } = await decryptIfNeeded(bytesOf('form-user-pw.pdf'), resolver);
    expect(decrypted).toBe(true);
    expect(resolver).toHaveBeenNthCalledWith(1, false);
    expect(resolver).toHaveBeenNthCalledWith(2, true);
  });

  it('propagates DecryptCancelled when the user cancels', async () => {
    const resolver = vi.fn(async () => {
      throw new DecryptCancelled();
    });
    await expect(decryptIfNeeded(bytesOf('form-user-pw.pdf'), resolver)).rejects.toBeInstanceOf(
      DecryptCancelled
    );
  });
});
```

Add the import at the top if not present: `import type { PasswordResolver } from './decrypt-pdf';` (merge into the existing import line).

- [ ] **Step 6: Run all helper tests**

Run: `bunx vitest run src/routes/editor/decrypt-pdf.test.ts`
Expected: PASS (all 5).

- [ ] **Step 7: Commit**

```bash
git add src/routes/editor/decrypt-pdf.ts src/routes/editor/decrypt-pdf.test.ts
git commit -m "feat(editor): decryptIfNeeded helper for encrypted PDFs"
```

---

## Task 3: `PasswordPromptModal.svelte`

Presentational modal following `DocumentPropertiesModal.svelte`'s markup conventions. It reads/writes a `passwordPrompt` object on the editor (defined here as a typed shape; the editor produces it in Task 4).

**Files:**
- Create: `src/routes/editor/PasswordPromptModal.svelte`
- Test: `src/routes/editor/PasswordPromptModal.svelte.test.ts`

**Interfaces:**
- Consumes (from Task 4, on `EditorState`):
  - `editor.passwordPrompt: { wrongPassword: boolean; resolve: (pw: string) => void; reject: () => void } | null`
- Produces: a modal that calls `resolve(pw)` on submit and `reject()` on cancel/backdrop/Escape. The component itself does not null out `passwordPrompt` — Task 4's resolve/reject wrappers do.

- [ ] **Step 1: Write the failing interaction test**

Create `src/routes/editor/PasswordPromptModal.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PasswordPromptModal from './PasswordPromptModal.svelte';

function editorWith(over: Partial<Record<string, unknown>> = {}) {
  return {
    passwordPrompt: { wrongPassword: false, resolve: vi.fn(), reject: vi.fn() },
    ...over
  } as never;
}

describe('PasswordPromptModal', () => {
  it('renders nothing when passwordPrompt is null', () => {
    render(PasswordPromptModal, { editor: editorWith({ passwordPrompt: null }) });
    expect(screen.queryByText(/password/i)).toBeNull();
  });

  it('resolves with the typed password on Unlock', async () => {
    const resolve = vi.fn();
    const editor = editorWith({
      passwordPrompt: { wrongPassword: false, resolve, reject: vi.fn() }
    });
    render(PasswordPromptModal, { editor });
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(resolve).toHaveBeenCalledWith('secret');
  });

  it('rejects on Cancel', async () => {
    const reject = vi.fn();
    const editor = editorWith({
      passwordPrompt: { wrongPassword: false, resolve: vi.fn(), reject }
    });
    render(PasswordPromptModal, { editor });
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(reject).toHaveBeenCalled();
  });

  it('shows an error line when wrongPassword is true', () => {
    render(PasswordPromptModal, {
      editor: editorWith({
        passwordPrompt: { wrongPassword: true, resolve: vi.fn(), reject: vi.fn() }
      })
    });
    expect(screen.getByText(/incorrect password/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/routes/editor/PasswordPromptModal.svelte.test.ts`
Expected: FAIL — component file does not exist.

- [ ] **Step 3: Implement the modal**

Create `src/routes/editor/PasswordPromptModal.svelte`:

```svelte
<script lang="ts">
	import type { EditorState } from './editor.svelte';

	let { editor }: { editor: EditorState } = $props();

	const prompt = $derived(editor.passwordPrompt);
	let password = $state('');
	let lastPrompt = $state<unknown>(null);

	$effect(() => {
		// Clear the field each time a fresh prompt opens.
		if (prompt && prompt !== lastPrompt) password = '';
		lastPrompt = prompt;
	});

	function submit() {
		prompt?.resolve(password);
	}
	function cancel() {
		prompt?.reject();
	}
</script>

{#if prompt}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) cancel();
		}}
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
			<h2 class="mb-1 text-base font-semibold text-slate-900">This PDF is password-protected</h2>
			<p class="mb-4 text-xs text-slate-500">
				Enter the password to open it. The file stays on your device.
			</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium text-slate-600">Password</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="password"
						autofocus
						class="rounded border border-slate-300 px-2 py-1.5 text-sm"
						class:border-red-400={prompt.wrongPassword}
						bind:value={password}
						onkeydown={(e) => {
							if (e.key === 'Escape') cancel();
						}}
					/>
				</label>
				{#if prompt.wrongPassword}
					<p class="mt-1 text-xs text-red-600">Incorrect password. Try again.</p>
				{/if}
				<div class="mt-5 flex justify-end gap-2">
					<button
						type="button"
						class="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
						onclick={cancel}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					>
						Unlock
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
```

- [ ] **Step 4: Run the modal tests**

Run: `bunx vitest run src/routes/editor/PasswordPromptModal.svelte.test.ts`
Expected: PASS (all 4).

> If `@testing-library/user-event` is not installed, the repo already uses `@testing-library/svelte` (see `vitest-setup-client.ts`); check `package.json` devDependencies and, if absent, replace `userEvent.type`/`userEvent.click` with `fireEvent` from `@testing-library/svelte` (`fireEvent.input(input, { target: { value: 'secret' } })`, `fireEvent.click(button)`) and `import { fireEvent } from '@testing-library/svelte'`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/PasswordPromptModal.svelte src/routes/editor/PasswordPromptModal.svelte.test.ts
git commit -m "feat(editor): password prompt modal for encrypted PDFs"
```

---

## Task 4: Wire unlock into the editor

Add state and the resolver, call `decryptIfNeeded` in both upload paths, mount the modal, and show the export notice.

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts` (state near line 218-221; `loadPdf` ~1214; `appendPdf` ~1299; `clearSource` ~1274)
- Modify: `src/routes/editor/+page.svelte` (imports ~line 13; modal mounts ~line 328)
- Modify: `src/routes/editor/DocumentPropertiesModal.svelte` (after the export toggles, ~line 99)

**Interfaces:**
- Consumes: `decryptIfNeeded`, `DecryptCancelled`, `PasswordResolver` from `./decrypt-pdf`.
- Produces on `EditorState`:
  - `passwordPrompt: { wrongPassword: boolean; resolve: (pw: string) => void; reject: () => void } | null`
  - `wasDecrypted: boolean`

- [ ] **Step 1: Add state, resolver, and imports to `editor.svelte.ts`**

Near the top imports, add:

```ts
import { decryptIfNeeded, DecryptCancelled, type PasswordResolver } from './decrypt-pdf';
```

In the class body, near the other `$state` fields (around `optimizeSize = $state(false)`), add:

```ts
	/** Active password prompt for an encrypted upload, or null. The modal calls
	 *  resolve/reject; both clear this back to null. */
	passwordPrompt: {
		wrongPassword: boolean;
		resolve: (pw: string) => void;
		reject: () => void;
	} | null = $state(null);

	/** True once any uploaded source was decrypted — the export will be unencrypted. */
	wasDecrypted = $state(false);

	/** Open the password modal and resolve with the entered password, or reject
	 *  with DecryptCancelled on cancel. Passed to decryptIfNeeded. */
	#requestPassword: PasswordResolver = (wrongPassword) =>
		new Promise<string>((resolve, reject) => {
			this.passwordPrompt = {
				wrongPassword,
				resolve: (pw) => {
					this.passwordPrompt = null;
					resolve(pw);
				},
				reject: () => {
					this.passwordPrompt = null;
					reject(new DecryptCancelled());
				}
			};
		});
```

- [ ] **Step 2: Decrypt in `loadPdf`**

In `loadPdf`, replace the line that reads the bytes:

```ts
			const bytes = new Uint8Array(await file.arrayBuffer());
```

with:

```ts
			const raw = new Uint8Array(await file.arrayBuffer());
			const { bytes, decrypted } = await decryptIfNeeded(raw, this.#requestPassword);
			if (decrypted) this.wasDecrypted = true;
```

(The existing `const exportCopy = bytes.slice();` and everything after it now operate on the decrypted `bytes` — no other change in the body.)

- [ ] **Step 3: Handle cancel in `loadPdf`'s catch**

The `loadPdf` catch currently sets `errorMessage` for any error. Make cancel silent — replace the catch block:

```ts
		} catch (e) {
			this.errorMessage =
				e instanceof PdfRenderError
					? e.message
					: 'Could not open that PDF. It may be corrupt or unsupported.';
		} finally {
```

with:

```ts
		} catch (e) {
			if (e instanceof DecryptCancelled) {
				// User dismissed the password prompt — not an error.
			} else {
				this.errorMessage =
					e instanceof PdfRenderError
						? e.message
						: 'Could not open that PDF. It may be corrupt or unsupported.';
			}
		} finally {
```

- [ ] **Step 4: Decrypt in `appendPdf` (mirror loadPdf)**

In `appendPdf`, replace:

```ts
			const bytes = new Uint8Array(await file.arrayBuffer());
			const exportCopy = bytes.slice();
```

with:

```ts
			const raw = new Uint8Array(await file.arrayBuffer());
			const { bytes, decrypted } = await decryptIfNeeded(raw, this.#requestPassword);
			if (decrypted) this.wasDecrypted = true;
			const exportCopy = bytes.slice();
```

Then update `appendPdf`'s catch (mirror Step 3): wrap the existing `errorMessage` assignment in `if (e instanceof DecryptCancelled) { /* silent */ } else { … }`. (Read the current catch block first and apply the same pattern; if `appendPdf` has no `PdfRenderError` branch, keep its existing message in the `else`.)

- [ ] **Step 5: Reset flags in `clearSource`**

In `clearSource`, add to the reset list (next to `this.errorMessage = null;`):

```ts
		this.wasDecrypted = false;
		this.passwordPrompt = null;
```

- [ ] **Step 6: Mount the modal in `+page.svelte`**

Add the import next to the other modal imports (~line 13):

```svelte
	import PasswordPromptModal from './PasswordPromptModal.svelte';
```

Add the component next to the other modal mounts (~line 328, near `<DocumentPropertiesModal {editor} />`):

```svelte
	<PasswordPromptModal {editor} />
```

- [ ] **Step 7: Add the export notice in `DocumentPropertiesModal.svelte`**

After the closing `</label>` of the "Compact PDF structure" block (~line 99, still inside the `flex flex-col gap-3` container), add:

```svelte
					{#if editor.wasDecrypted}
						<p class="mt-1 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
							This PDF was password-protected. The exported file will not be
							password-protected.
						</p>
					{/if}
```

- [ ] **Step 8: Typecheck**

Run: `bun run check`
Expected: no new errors in `editor.svelte.ts`, `+page.svelte`, `DocumentPropertiesModal.svelte`, `PasswordPromptModal.svelte`.

- [ ] **Step 9: Run the full editor test suite**

Run: `bunx vitest run src/routes/editor`
Expected: PASS (existing tests + the new decrypt/modal tests).

- [ ] **Step 10: Manual smoke test**

Run: `bun run dev`, open the editor, and upload each fixture:
- `form-plain.pdf` → opens, no prompt.
- `form-owner-locked.pdf` → opens, no prompt, "will not be password-protected" notice shows in Document properties.
- `form-user-pw.pdf` → prompt appears; wrong password shows the error and re-prompts; `secret` opens it; Cancel closes with no error banner.
Export each and confirm the downloaded file opens without a password.

- [ ] **Step 11: Commit**

```bash
git add src/routes/editor/editor.svelte.ts src/routes/editor/+page.svelte src/routes/editor/DocumentPropertiesModal.svelte
git commit -m "feat(editor): unlock encrypted PDFs on upload with password prompt"
```

---

## Self-Review

**Spec coverage:**
- decrypt-upfront helper → Task 2. ✓
- `isEncrypted` / empty-password silent path / `passwordType` loop → Task 2 Step 3. ✓
- Save-mode open question (spec Step 0) → Task 2 Steps 1/4 (characterization test drives the choice). ✓
- Password modal → Task 3. ✓
- Wiring into `loadPdf` + `appendPdf` (both scopes) → Task 4 Steps 2/4. ✓
- Cancel = silent abort → Task 4 Steps 3/4. ✓
- Export notice (`wasDecrypted`) → Task 4 Step 7. ✓
- `clearSource` reset → Task 4 Step 5. ✓
- Tests with encrypted fixtures → Task 1 + Task 2 Step 5. ✓
- Out-of-scope (re-encryption, XFA, password persistence) — not implemented. ✓

**Placeholder scan:** No TBD/TODO. The only intentional variability is Task 2 Step 4's conditional fallback, which supplies exact replacement code for each branch.

**Type consistency:** `decryptIfNeeded` returns `{ bytes, decrypted }` — consumed identically in Task 4 Steps 2/4. `PasswordResolver = (wrongPassword: boolean) => Promise<string>` — matches `#requestPassword` signature and the modal's `resolve(pw)/reject()` shape (Task 3 interface == Task 4 Step 1 state). `passwordPrompt` shape identical across Task 3 test, Task 3 component, and Task 4 state. `DecryptCancelled` thrown in Task 2 / `#requestPassword`, caught in Task 4 Steps 3/4. Field name `full_name` consistent across Task 1 generator and Task 2 tests.
