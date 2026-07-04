# File-Size Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-controlled "Optimize file size" export option (object-stream compression) and collapse the export's redundant save passes into one in-session serialize.

**Architecture:** `EditState` gains an `objectStreams?: boolean` flag that flows to `doc.save({ objectStreams })`. The two post-build load/save passes (multi-select application + flatten) move into `finishDoc`, run in the same session via 1.9.0's `getForm()`-on-created-doc, before a single final save. A `optimizeSize` boolean on the editor store drives a new checkbox in the document-properties modal.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, `@ignaciano3/better-pdf` 1.10.0, Vitest, Tailwind. Use `bun` for all commands.

## Global Constraints

- Use `bun`, never `npm`/`pnpm`, for running commands.
- Library floor: `@ignaciano3/better-pdf` `^1.10.0` (provides `SaveOptions.objectStreams` and `getForm()` on created docs). Already in `package.json`.
- Object streams break PDF/A-1 conformance and require PDF 1.5+ — the option MUST default off and never be silently forced on.
- Transport/type name is `objectStreams` (matches the lib option); editor-store/UI name is `optimizeSize` (user-facing framing).
- Deflate compression stays always-on (lib default) — no toggle, no code change.
- Scope: do NOT touch the "always rebuild" (D3) export architecture.
- Follow existing patterns; scope Prettier to touched files only (repo is not Prettier-clean).

---

### Task 1: Build engine — collapse passes + `objectStreams` save

Moves multi-select and flatten into `finishDoc` (in-session, before one final `save`), threads `objectStreams` into that save, and deletes the two now-dead helpers. Existing flatten/field tests are the no-regression guard; new tests cover the option.

**Files:**
- Modify: `src/lib/pdf/types.ts` (add `EditState.objectStreams`)
- Modify: `src/lib/pdf/build.ts` (rewrite `finishDoc` + `buildPdf`; delete `applyMultiSelections`, `flattenAllFields`)
- Test: `src/lib/pdf/build.flatten.test.ts` (add `objectStreams` cases)

**Interfaces:**
- Consumes: `collectMultiSelections(elements) → { name: string; values: string[] }[]` (existing, retained), `PdfDocument.getForm()`, `form.getListBox(name).selectMultiple(values)`, `form.flatten()`, `doc.save(opts?: { objectStreams?: boolean })`.
- Produces: `EditState.objectStreams?: boolean`; `buildPdf(state) → Promise<Uint8Array>` (unchanged signature); `finishDoc` now performs all form finishing internally.

- [ ] **Step 1: Add the `objectStreams` field to `EditState`**

In `src/lib/pdf/types.ts`, inside the `EditState` interface, immediately after the `flatten?: boolean;` block (ends at line 80), add:

```ts
	/**
	 * When true, the export packs non-stream objects into PDF object streams +
	 * cross-reference streams for a smaller file. Forces PDF 1.5+ and is NOT
	 * PDF/A-1 conformant, so it is opt-in and defaults off. Applies to the
	 * full-document save path (the export always rebuilds), including flattened
	 * output.
	 */
	objectStreams?: boolean;
```

- [ ] **Step 2: Write the failing tests**

Append these three cases to the `describe('buildPdf flatten', ...)` block in `src/lib/pdf/build.flatten.test.ts` (before its closing `});`):

```ts
	it('objectStreams export re-loads and fields round-trip', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [textField()],
			objectStreams: true
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const fields = doc.getForm().getFields();
		expect(fields.length).toBe(1);
		expect(fields[0]?.name).toBe('applicant');
	});

	it('objectStreams packs objects into an object stream (structural compression)', async () => {
		const state: EditState = { pageSize: A4, elements: [textField()] };
		const plain = await buildPdf(state);
		const packed = await buildPdf({ ...state, objectStreams: true });
		const asText = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
		// Object streams require cross-reference streams; the /ObjStm marker is
		// present only when packing actually happened. This is the working path
		// (no getForm(): no flatten, no multi-select).
		expect(asText(plain)).not.toContain('/ObjStm');
		expect(asText(packed)).toContain('/ObjStm');
	});

	it('flatten with objectStreams still yields a valid flattened PDF (objectStreams is a no-op once getForm seals the doc)', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [textField()],
			flatten: true,
			objectStreams: true
		};
		const bytes = await buildPdf(state);
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
		expect(await fieldCount(bytes)).toBe(0);
	});

	it('objectStreams unset leaves fields interactive and re-loadable', async () => {
		const state: EditState = { pageSize: A4, elements: [textField()] };
		expect(await fieldCount(await buildPdf(state))).toBe(1);
	});
```

- [ ] **Step 3: Run the new tests to verify they pass or fail meaningfully**

Run: `bunx vitest run src/lib/pdf/build.flatten.test.ts`
Expected: the first two new tests may already PASS (compression is default-on and `objectStreams` is currently ignored by the not-yet-updated code) — that is fine; they lock in behavior. If any FAIL, note the reason; Steps 4–6 must make all green.

- [ ] **Step 4: Rewrite `finishDoc` to finish forms in-session and honor `objectStreams`**

In `src/lib/pdf/build.ts`, replace the entire `finishDoc` function (currently lines 334–345) with:

```ts
/**
 * Shared export tail for both rebuild paths: embed fonts, stamp non-field and
 * field elements, draw the watermark, apply metadata/outline, finish the form
 * in-session, and serialize once. `pageWidths[i]`/`pageHeights[i]` are the
 * un-rotated content box of output page `i`. Keeping this in one place stops the
 * two builders' element/watermark/metadata ordering from drifting apart.
 *
 * Form finishing runs here (not as post-build load/save passes) using the
 * library's `getForm()`-on-created-doc support: multi-select initial values are
 * applied, then the form is flattened when requested. `getForm()` seals the
 * document on first call, so it must come after every drawing and `createForm()`
 * authoring step — which all complete above. Multi-select runs before flatten so
 * the selected appearance is baked into the flattened content.
 *
 * `objectStreams` is passed to the final `save()` but is honored ONLY on the
 * direct create-path save (no `getForm()`). Once we call `getForm()` here (for
 * multi-select or flatten) the doc is sealed onto the incremental path, which
 * ignores `objectStreams` — so it is a no-op for flattened / multi-select
 * exports. The UI disables the "Optimize file size" toggle when flatten is on;
 * passing the flag here regardless is harmless and keeps the engine defensive.
 */
async function finishDoc(
	doc: PdfDocument,
	state: EditState,
	pageWidths: number[],
	pageHeights: number[]
): Promise<Uint8Array> {
	const fonts = await embedFonts(doc, state.fonts);
	await stampAndAuthor(doc, state.elements, pageHeights, fonts);
	if (state.watermark) await drawWatermark(doc, pageWidths, pageHeights, state.watermark);
	applyDocumentProps(doc, state.metadata, state.outline, pageHeights.length);

	// In-session form finishing. Only touch the form when there is form work to
	// do — calling getForm() would otherwise seal an interactive doc needlessly.
	const multi = collectMultiSelections(state.elements);
	const hasFields = state.elements.some((e) => e.type === 'field');
	const doFlatten = Boolean(state.flatten) && hasFields;
	if (multi.length > 0 || doFlatten) {
		const form = doc.getForm();
		for (const { name, values } of multi) {
			form.getListBox(name).selectMultiple(values);
		}
		if (doFlatten) form.flatten();
	}

	return doc.save(state.objectStreams ? { objectStreams: true } : {});
}
```

- [ ] **Step 5: Simplify `buildPdf` to a straight dispatch**

In `src/lib/pdf/build.ts`, replace the `buildPdf` function body (currently lines 97–115, the code inside the function — keep its preceding docstring) with:

```ts
export async function buildPdf(state: EditState): Promise<Uint8Array> {
	const sources = resolveSources(state);
	const hasSource = sources.some((s) => s && s.byteLength > 0);
	return hasSource ? buildSourceRebuild(state, sources) : buildBlankRebuild(state);
}
```

- [ ] **Step 6: Delete the now-dead helpers**

In `src/lib/pdf/build.ts`, delete the entire `flattenAllFields` function (currently lines 29–40, including its docstring) and the entire `applyMultiSelections` function (currently lines 60–76, including its docstring). Keep `collectMultiSelections` — it is still used by `finishDoc`.

- [ ] **Step 7: Run the full build-engine test suite**

Run: `bunx vitest run src/lib/pdf/`
Expected: PASS — all existing suites (`build.flatten.test.ts`, `build.field.test.ts`, `build.test.ts`, `build.pageops.test.ts`, etc.) green, including the new `objectStreams` cases and the existing multi-select round-trip / flatten cases (proving the in-session collapse is behavior-preserving).

- [ ] **Step 8: Typecheck**

Run: `bun run check`
Expected: no new type errors in `src/lib/pdf/build.ts` or `types.ts` (an unused-symbol error would flag a helper that was referenced but not fully removed).

- [ ] **Step 9: Commit**

```bash
git add src/lib/pdf/types.ts src/lib/pdf/build.ts src/lib/pdf/build.flatten.test.ts
git commit -m "feat(pdf): objectStreams save option + collapse export passes in-session"
```

---

### Task 2: Server-side validation for `objectStreams`

Reject a malformed `objectStreams` on the export command, mirroring the existing `flatten` guard.

**Files:**
- Modify: `src/routes/editor/export-validate.ts:394-396`
- Test: `src/routes/editor/export-validate.test.ts`

**Interfaces:**
- Consumes: `EditState.objectStreams?: boolean` (Task 1).
- Produces: a 422 error when `objectStreams` is present and not a boolean.

- [ ] **Step 1: Write the failing test**

Add to `src/routes/editor/export-validate.test.ts` (find the block exercising `validateExportInput` and add a case alongside the existing `flatten` validation test; use the same helper the file already uses to build a valid base input — mirror the nearest existing "Invalid flatten flag" test's structure):

```ts
	it('rejects a non-boolean objectStreams flag', () => {
		expect(() =>
			validateExportInput({
				state: { pageSize: [595, 842], elements: [], objectStreams: 'yes' },
				fingerprint: 'fp'
			})
		).toThrow();
	});
```

If the existing tests construct input differently (e.g. via a `baseInput()` helper), match that shape instead — the key is `state.objectStreams` set to a non-boolean.

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/routes/editor/export-validate.test.ts -t "objectStreams"`
Expected: FAIL — no error is thrown yet (the field is currently unvalidated).

- [ ] **Step 3: Add the guard**

In `src/routes/editor/export-validate.ts`, immediately after the existing `flatten` guard (lines 394–396):

```ts
	if (state.flatten !== undefined && typeof state.flatten !== 'boolean') {
		error(422, 'Invalid flatten flag');
	}
```

add:

```ts
	if (state.objectStreams !== undefined && typeof state.objectStreams !== 'boolean') {
		error(422, 'Invalid objectStreams flag');
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/routes/editor/export-validate.test.ts`
Expected: PASS — the new case and all existing validation cases green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/export-validate.ts src/routes/editor/export-validate.test.ts
git commit -m "feat(export): validate objectStreams flag on the export command"
```

---

### Task 3: Editor store plumbing (`optimizeSize`)

Carry a new `optimizeSize` boolean through the editor store exactly as `flatten` travels: state, history snapshot/restore, change tracking, and export-state assembly.

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts` (lines 83, 206, 289, 322, 350, 1508 — the `flatten` seam)
- Test: `src/routes/editor/editor.svelte.test.ts`

**Interfaces:**
- Consumes: `EditState.objectStreams` (Task 1); `exportPdf({ state, fingerprint })` (mocked in tests).
- Produces: `EditorState.optimizeSize: boolean` (default `false`); export state includes `objectStreams: true` iff `optimizeSize` is true.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `src/routes/editor/editor.svelte.test.ts` (the file already mocks `exportPdf`, so `export()` records its call args without hitting the server):

```ts
describe('EditorState optimizeSize', () => {
	it('defaults optimizeSize to false and omits objectStreams from export state', async () => {
		const e = new EditorState();
		await e.export();
		const arg = vi.mocked(exportPdf).mock.calls.at(-1)?.[0];
		expect(e.optimizeSize).toBe(false);
		expect(arg?.state.objectStreams).toBeUndefined();
	});

	it('sends objectStreams: true when optimizeSize is enabled', async () => {
		const e = new EditorState();
		e.optimizeSize = true;
		await e.export();
		const arg = vi.mocked(exportPdf).mock.calls.at(-1)?.[0];
		expect(arg?.state.objectStreams).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/routes/editor/editor.svelte.test.ts -t "optimizeSize"`
Expected: FAIL — `e.optimizeSize` is `undefined` and `objectStreams` never set (property does not exist yet).

- [ ] **Step 3: Add the state field**

In `src/routes/editor/editor.svelte.ts`, immediately after the `flatten` field (line 206):

```ts
	/** When true, fields are flattened (baked) on export. */
	flatten = $state(false);
```

add:

```ts
	/**
	 * When true, the export uses object-stream compression for a smaller file
	 * (PDF 1.5+, not PDF/A-1 conformant). Opt-in; defaults off.
	 */
	optimizeSize = $state(false);
```

- [ ] **Step 4: Track it for history**

In the change-tracking effect (line 289), immediately after `void this.flatten;` add:

```ts
			void this.optimizeSize;
```

- [ ] **Step 5: Add it to the DocSnapshot type**

In the `DocSnapshot` interface, after `flatten: boolean;` (line 83) add:

```ts
	optimizeSize: boolean;
```

- [ ] **Step 6: Include it in the snapshot**

In `#takeSnapshot()` (line 322), after `flatten: this.flatten,` add:

```ts
			optimizeSize: this.optimizeSize,
```

- [ ] **Step 7: Restore it on undo/redo**

In `#applySnapshot()` (line 350), after `this.flatten = c.flatten;` add:

```ts
		this.optimizeSize = c.optimizeSize;
```

- [ ] **Step 8: Add it to the export state (gated by !flatten)**

`objectStreams` is a no-op once flatten routes through `getForm()` (library
limitation), so never send it alongside flatten. In `export()` (line 1508),
after `...(this.flatten ? { flatten: true } : {}),` add:

```ts
				...(this.optimizeSize && !this.flatten ? { objectStreams: true } : {}),
```

The matching test above (`sends objectStreams: true when optimizeSize is
enabled`) uses a default editor where `flatten` is `false`, so the guard passes.
Add one more case asserting the guard suppresses the flag when flatten is on:

```ts
	it('omits objectStreams when flatten is also enabled (no-op combo)', async () => {
		const e = new EditorState();
		e.optimizeSize = true;
		e.flatten = true;
		await e.export();
		const arg = vi.mocked(exportPdf).mock.calls.at(-1)?.[0];
		expect(arg?.state.objectStreams).toBeUndefined();
		expect(arg?.state.flatten).toBe(true);
	});
```

- [ ] **Step 9: Run the store tests**

Run: `bunx vitest run src/routes/editor/editor.svelte.test.ts src/routes/editor/editor.history.test.ts src/routes/editor/editor-history.test.ts`
Expected: PASS — the two new `optimizeSize` cases plus all existing store/history tests (the snapshot/restore additions must not break history round-trips).

- [ ] **Step 10: Commit**

```bash
git add src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git commit -m "feat(editor): carry optimizeSize through store, history, and export state"
```

---

### Task 4: Document-properties modal checkbox + explainer

Expose the toggle in the UI with inline helper text explaining object streams.

**Files:**
- Modify: `src/routes/editor/DocumentPropertiesModal.svelte:75-78`

**Interfaces:**
- Consumes: `editor.optimizeSize` (Task 3) via `bind:checked`.
- Produces: no new exports — a UI control bound to the store.

- [ ] **Step 1: Add the checkbox and helper text**

In `src/routes/editor/DocumentPropertiesModal.svelte`, replace the existing flatten `<label>` (lines 75–78):

```svelte
				<label class="mt-1 flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={editor.flatten} />
					<span class="text-slate-700">Flatten fields on export (print-ready, non-editable)</span>
				</label>
```

with (the flatten label unchanged, followed by the new one). The optimize
checkbox is `disabled` while flatten is checked — `objectStreams` is a no-op
once flatten seals the doc via `getForm()`, so we never offer it then. The
disabled label is muted, and the helper text swaps to explain why:

```svelte
				<label class="mt-1 flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={editor.flatten} />
					<span class="text-slate-700">Flatten fields on export (print-ready, non-editable)</span>
				</label>
				<label class="mt-1 flex items-start gap-2 text-sm" class:opacity-50={editor.flatten}>
					<input
						type="checkbox"
						class="mt-0.5"
						disabled={editor.flatten}
						bind:checked={editor.optimizeSize}
					/>
					<span class="text-slate-700">
						Optimize file size (smaller file, PDF 1.5+)
						<span class="mt-0.5 block text-xs text-slate-500">
							{#if editor.flatten}
								Unavailable while flattening — flattened files can't use this optimization.
							{:else}
								Packs the PDF's internal objects into compressed streams, producing a noticeably
								smaller file. Requires a PDF 1.5+ reader (all modern viewers) and is not suitable
								for PDF/A archival.
							{/if}
						</span>
					</span>
				</label>
```

- [ ] **Step 2: Typecheck the component**

Run: `bun run check`
Expected: PASS — no Svelte/TS errors; `editor.optimizeSize` resolves against the `EditorState` field added in Task 3.

- [ ] **Step 3: Verify in the running app**

Run: `bun run dev`, open the editor, open Document properties. Confirm the "Optimize file size" checkbox and its explainer render under "Flatten fields", the box toggles, and exporting with it checked downloads a valid, smaller PDF that opens correctly. Stop the dev server when done.

- [ ] **Step 4: Format touched files**

Run: `bunx prettier --write src/routes/editor/DocumentPropertiesModal.svelte`
(Scope Prettier to touched files only — the repo is not Prettier-clean.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/DocumentPropertiesModal.svelte
git commit -m "feat(editor): add Optimize file size toggle to document properties"
```

---

## Self-Review

**Spec coverage:**
- Part A UX (checkbox + inline explainer, default off) → Task 4. ✓
- Part A data flow (all six `editor.svelte.ts` sites, `types.ts`, `export-validate.ts`, `build.ts` save) → Tasks 1–4. ✓
- Deflate left always-on (no code) → stated in Global Constraints; no task needed. ✓
- Part B collapse (in-session getForm → selectMultiple → flatten → single save; delete the two helpers; keep `collectMultiSelections`) → Task 1. ✓
- Part B synergy (flatten in-session so objectStreams reaches flattened output) → covered by Task 1 Step 4 + the `objectStreams + flatten` test. ✓
- Testing (round-trip, flatten+objectStreams valid, multi-select survives, non-boolean rejected) → Task 1 Steps 2/7, Task 2. ✓
- Out of scope (D3 architecture, deflate toggle) → Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Task 2 Step 1 notes the one conditional (match the file's existing input-builder helper) with an explicit fallback. ✓

**Type consistency:** `objectStreams` (EditState/transport) vs `optimizeSize` (store/UI) used consistently and called out in Global Constraints. `finishDoc`/`buildPdf`/`collectMultiSelections` signatures match Task 1's Interfaces. ✓
