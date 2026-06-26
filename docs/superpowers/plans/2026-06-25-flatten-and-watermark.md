# Flatten-on-export + Watermark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two export options to the PDF editor — a global "flatten fields" toggle (bakes AcroForm fields into static content) and a single centered, rotated, semi-transparent **text** watermark stamped on every page.

**Architecture:** Both features add an optional field to `EditState` that flows through the existing pipeline `editor.svelte.ts` (assembles state) → `export.remote.ts` → `validateExportInput` (security boundary) → `buildPdf`. Flatten is a post-process second pass over the built bytes (`PdfDocument.load` → `getForm().flatten()` → re-save), because authored fields are built with `FormBuilder`, which has no flatten. Watermark is drawn in `buildPdf` per page via `page.drawText` after stamping, and previewed on the canvas via a non-interactive overlay.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, `@ignaciano3/better-pdf` ≥1.1, Vitest + @testing-library/svelte.

## Global Constraints

- `@ignaciano3/better-pdf` floor: **1.1.0** (already in `package.json`).
- Watermark v1 is **text-only**. `DrawImageOptions` has no `opacity`/`rotate`, so image watermarks are out of scope (recorded as a lib feature request).
- The validator (`export-validate.ts`) is the **security boundary**: every new `EditState` field MUST be validated there, throwing `error(422, …)` / `error(413, …)` on violation.
- Coordinates in `EditState` are **top-left origin** PDF points; the builder flips Y via `topLeftToPdfY`. Watermark centering computes directly in PDF (bottom-left) space, so it does not use that helper.
- Follow existing patterns: build logic + colocated `build.*.test.ts`; overlays registered in `overlays/index.ts`; modals mounted in `+page.svelte`.
- TDD throughout: failing test → minimal impl → green → commit.

---

## File Structure

**Feature A — Flatten:**
- Modify `src/lib/pdf/types.ts` — add `EditState.flatten?: boolean`.
- Modify `src/lib/pdf/build.ts` — `flattenAllFields` helper + gate in `buildPdf`.
- Create `src/lib/pdf/build.flatten.test.ts` — build/flatten tests.
- Modify `src/routes/editor/export-validate.ts` — validate `flatten`.
- Modify `src/routes/editor/editor.svelte.ts` — `flatten` state + include in export.
- Modify `src/routes/editor/DocumentPropertiesModal.svelte` — checkbox.
- Modify `src/routes/editor/export-validate.test.ts` — validator tests.

**Feature B — Watermark:**
- Modify `src/lib/pdf/types.ts` — add `Watermark` + `EditState.watermark?`.
- Modify `src/lib/pdf/build.ts` — `drawWatermark` + thread page widths.
- Create `src/lib/pdf/build.watermark.test.ts` — build tests.
- Modify `src/routes/editor/export-validate.ts` — validate `watermark`.
- Modify `src/routes/editor/editor.svelte.ts` — `watermark`/`watermarkModalOpen` state + include in export.
- Create `src/routes/editor/WatermarkModal.svelte` — editor UI.
- Modify `src/routes/editor/Toolbar.svelte` — "Watermark…" item in the Document menu.
- Modify `src/routes/editor/+page.svelte` — mount `WatermarkModal`.
- Create `src/routes/editor/overlays/WatermarkOverlay.svelte` — canvas preview.
- Modify `src/routes/editor/Canvas.svelte` — render the overlay per page.
- Create `src/routes/editor/WatermarkModal.svelte.test.ts` — component test.

---

# FEATURE A — Flatten-on-export

### Task A1: Flatten in the build (model + helper + gate)

**Files:**
- Modify: `src/lib/pdf/types.ts` (add `flatten` to `EditState`)
- Modify: `src/lib/pdf/build.ts` (helper + `buildPdf` gate)
- Test: `src/lib/pdf/build.flatten.test.ts` (create)

**Interfaces:**
- Consumes: existing `buildPdf(state: EditState): Promise<Uint8Array>`, `PdfDocument` from `@ignaciano3/better-pdf`.
- Produces: `EditState.flatten?: boolean`; `buildPdf` returns flattened bytes when `state.flatten === true` and the document has ≥1 field element.

- [ ] **Step 1: Add the model field**

In `src/lib/pdf/types.ts`, inside `interface EditState`, after the `fonts?` field, add:

```ts
	/**
	 * When true, every authored AcroForm field is flattened (baked into page
	 * content) on export, producing a print-ready, non-editable PDF. No-op when
	 * the document has no fields.
	 */
	flatten?: boolean;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/pdf/build.flatten.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState, FieldElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function textField(): FieldElement {
	return {
		type: 'field',
		id: 'f1',
		field: 'text',
		name: 'applicant',
		x: 50,
		y: 50,
		width: 200,
		height: 24,
		page: 0
	};
}

async function fieldCount(bytes: Uint8Array): Promise<number> {
	const doc = await PdfDocument.load(bytes);
	return doc.getForm().getFields().length;
}

describe('buildPdf flatten', () => {
	it('keeps fields interactive when flatten is unset', async () => {
		const state: EditState = { pageSize: A4, elements: [textField()] };
		expect(await fieldCount(await buildPdf(state))).toBe(1);
	});

	it('removes all fields when flatten is true', async () => {
		const state: EditState = { pageSize: A4, elements: [textField()], flatten: true };
		expect(await fieldCount(await buildPdf(state))).toBe(0);
	});

	it('is a no-op when there are no fields', async () => {
		const state: EditState = { pageSize: A4, elements: [], flatten: true };
		const bytes = await buildPdf(state);
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/build.flatten.test.ts`
Expected: FAIL — the "removes all fields when flatten is true" case returns 1 (flatten not implemented yet).

- [ ] **Step 4: Implement the helper + gate**

In `src/lib/pdf/build.ts`, add this helper after the `PdfBuildError` class (top of file region, before `buildPdf`):

```ts
/**
 * Flatten every AcroForm field in `bytes` into static page content. Authored
 * fields are built with `FormBuilder` (no flatten method), so flattening is a
 * post-process pass: load the built bytes, flatten via the loaded `PdfForm`,
 * and re-save. The output has no interactive AcroForm.
 */
async function flattenAllFields(bytes: Uint8Array): Promise<Uint8Array> {
	const doc = await PdfDocument.load(bytes);
	const form = doc.getForm();
	form.flatten();
	return await doc.save();
}
```

Then change `buildPdf` to gate on `flatten`. Replace the body:

```ts
export async function buildPdf(state: EditState): Promise<Uint8Array> {
	const sources = resolveSources(state);
	const hasSource = sources.some((s) => s && s.byteLength > 0);
	const bytes = hasSource
		? await buildSourceRebuild(state, sources)
		: await buildBlankRebuild(state);

	// Flatten is a second pass over the built (interactive) bytes. Skip when no
	// fields exist — flattening nothing just costs a load/save round-trip.
	const hasFields = state.elements.some((e) => e.type === 'field');
	if (state.flatten && hasFields) {
		return flattenAllFields(bytes);
	}
	return bytes;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/pdf/build.flatten.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf/types.ts src/lib/pdf/build.ts src/lib/pdf/build.flatten.test.ts
git commit -m "feat(export): flatten authored fields on export"
```

---

### Task A2: Validate `flatten` in the export boundary

**Files:**
- Modify: `src/routes/editor/export-validate.ts`
- Test: `src/routes/editor/export-validate.test.ts`

**Interfaces:**
- Consumes: `validateExportInput(input): ExportInput` and the `state` object it builds.
- Produces: a 422 when `state.flatten` is present and not a boolean.

- [ ] **Step 1: Write the failing test**

In `src/routes/editor/export-validate.test.ts`, add (mirror the existing helper that builds a minimal valid input — find how other tests construct `{ state, fingerprint }` and reuse that shape):

```ts
it('accepts a boolean flatten flag', () => {
	const input = { state: { pageSize: [595, 842], elements: [], flatten: true }, fingerprint: 'fp' };
	expect(() => validateExportInput(input)).not.toThrow();
});

it('rejects a non-boolean flatten flag', () => {
	const input = { state: { pageSize: [595, 842], elements: [], flatten: 'yes' }, fingerprint: 'fp' };
	expect(() => validateExportInput(input)).toThrow();
});
```

(If the test file does not already import `validateExportInput`, add `import { validateExportInput } from './export-validate';` at the top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/editor/export-validate.test.ts`
Expected: FAIL — "rejects a non-boolean flatten flag" does not throw (no validation yet).

- [ ] **Step 3: Implement validation**

In `src/routes/editor/export-validate.ts`, inside `validateExportInput`, immediately before the final `return { state: state as EditState, fingerprint };`, add:

```ts
	if (state.flatten !== undefined && typeof state.flatten !== 'boolean') {
		error(422, 'Invalid flatten flag');
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/editor/export-validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/export-validate.ts src/routes/editor/export-validate.test.ts
git commit -m "feat(export): validate flatten flag"
```

---

### Task A3: Flatten toggle in editor state + Document properties modal

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts`
- Modify: `src/routes/editor/DocumentPropertiesModal.svelte`

**Interfaces:**
- Consumes: `EditorState.export()` building the `state` object (~`editor.svelte.ts:1241`).
- Produces: `EditorState.flatten: boolean` ($state); `state.flatten` is shipped when true.

- [ ] **Step 1: Add editor state**

In `src/routes/editor/editor.svelte.ts`, near the other document-level state (after `outline = $state<OutlineItem[]>([]);`, ~line 179), add:

```ts
	/** When true, fields are flattened (baked) on export. */
	flatten = $state(false);
```

- [ ] **Step 2: Include it in the exported state**

In the `export()` method, in the `state` object literal (~line 1241), after the `...(outline.length > 0 ? { outline } : {})` line, add:

```ts
				...(this.flatten ? { flatten: true } : {})
```

- [ ] **Step 3: Add the checkbox to the modal**

In `src/routes/editor/DocumentPropertiesModal.svelte`, inside the `<div class="flex flex-col gap-3">` block, after the Keywords `<label>…</label>`, add:

```svelte
				<label class="mt-1 flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={editor.flatten} />
					<span class="text-gray-700">Flatten fields on export (print-ready, non-editable)</span>
				</label>
```

- [ ] **Step 4: Typecheck + existing tests**

Run: `npm run check && npx vitest run src/routes/editor/export-validate.test.ts src/lib/pdf/build.flatten.test.ts`
Expected: 0 errors; all green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/editor.svelte.ts src/routes/editor/DocumentPropertiesModal.svelte
git commit -m "feat(export): flatten toggle in document properties"
```

---

# FEATURE B — Watermark (text-only)

### Task B1: Watermark model

**Files:**
- Modify: `src/lib/pdf/types.ts`

**Interfaces:**
- Produces: `Watermark` interface and `EditState.watermark?: Watermark`.

- [ ] **Step 1: Add the type**

In `src/lib/pdf/types.ts`, after the `EmbeddedFontAsset` interface (before the `FieldKind` type), add:

```ts
/**
 * A single text watermark stamped centered, rotated, and semi-transparent on
 * every output page at export. v1 is text-only — the lib's `drawImage` has no
 * opacity/rotation, so image watermarks are deferred.
 */
export interface Watermark {
	/** The watermark text (e.g. "DRAFT"). Empty/whitespace ⇒ no watermark. */
	text: string;
	/** Standard font. Defaults to Helvetica-Bold. */
	font?: StandardFontName;
	/** Font size in points. Defaults to 48. */
	size?: number;
	/** RGB components in 0..1. Defaults to mid-gray. */
	color?: { r: number; g: number; b: number };
	/** Opacity 0..1. Defaults to 0.3. */
	opacity?: number;
	/** Clockwise display rotation in degrees. Defaults to 45. */
	rotation?: number;
}
```

- [ ] **Step 2: Add it to `EditState`**

In `interface EditState`, after the `flatten?: boolean;` field added in Task A1, add:

```ts
	/**
	 * Optional text watermark stamped on every output page at export. Omitted
	 * when unset or when its text is empty.
	 */
	watermark?: Watermark;
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/types.ts
git commit -m "feat(watermark): add Watermark model"
```

---

### Task B2: Draw the watermark in the build

**Files:**
- Modify: `src/lib/pdf/build.ts`
- Test: `src/lib/pdf/build.watermark.test.ts` (create)

**Interfaces:**
- Consumes: `EditState.watermark`, `doc.getFont(name)`, `PdfFont.widthOfTextAtSize`, `page.drawText`.
- Produces: a watermark drawn centered on every page when `state.watermark` has non-empty text. `buildBlankRebuild`/`buildSourceRebuild` now also collect a `pageWidths: number[]` array parallel to `pageHeights`.

**Background:** the lib's text rotation is **counter-clockwise** (`DrawTextOptions.rotate`), while the editor's convention is clockwise; negate when drawing (consistent with how `TextElement.rotation` is handled in `render.ts`). Center: `x = (pageWidth - textWidth) / 2`, `y = pageHeight / 2`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/build.watermark.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import type { EditState } from './types';

const A4: [number, number] = [595.28, 841.89];

function isPdf(bytes: Uint8Array): boolean {
	return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

describe('buildPdf watermark', () => {
	it('produces a valid, larger PDF when a watermark is set', async () => {
		const base: EditState = { pageSize: A4, elements: [] };
		const withWm: EditState = { ...base, watermark: { text: 'DRAFT' } };
		const plain = await buildPdf(base);
		const stamped = await buildPdf(withWm);
		expect(isPdf(stamped)).toBe(true);
		expect(stamped.byteLength).toBeGreaterThan(plain.byteLength);
	});

	it('ignores an empty-text watermark', async () => {
		const base = await buildPdf({ pageSize: A4, elements: [] });
		const empty = await buildPdf({ pageSize: A4, elements: [], watermark: { text: '   ' } });
		expect(empty.byteLength).toBe(base.byteLength);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf/build.watermark.test.ts`
Expected: FAIL — stamped size equals plain size (watermark not drawn).

- [ ] **Step 3: Add the `drawWatermark` helper**

In `src/lib/pdf/build.ts`, add near the other draw helpers (after `toColor`):

```ts
/**
 * Stamp a single text watermark centered, rotated, and semi-transparent on
 * every page. `pageWidths[i]`/`pageHeights[i]` are the content box of output
 * page `i`. No-op when the text is empty/whitespace. The lib rotates
 * counter-clockwise, so the clockwise editor angle is negated.
 */
function drawWatermark(
	doc: PdfDocument,
	pageWidths: number[],
	pageHeights: number[],
	wm: import('./types').Watermark
): void {
	const text = wm.text.trim();
	if (text.length === 0) return;
	const size = wm.size ?? 48;
	const fontName = wm.font ?? 'Helvetica-Bold';
	const font = doc.getFont(fontName);
	const color = wm.color ? toColor(wm.color) : rgb(0.5, 0.5, 0.5);
	const opacity = wm.opacity ?? 0.3;
	const rotate = -(wm.rotation ?? 45);
	const textWidth = font.widthOfTextAtSize(text, size);
	for (let i = 0; i < pageHeights.length; i++) {
		const page = doc.getPage(i);
		const x = ((pageWidths[i] as number) - textWidth) / 2;
		const y = (pageHeights[i] as number) / 2;
		page.drawText(text, { x, y, size, font, color, opacity, rotate });
	}
}
```

- [ ] **Step 4: Collect page widths and call `drawWatermark`**

In `buildBlankRebuild`, add a `pageWidths` array alongside `pageHeights`. Where `pageHeights.push(h)` / `pageHeights.push(state.pageSize[1])` occur, also push the corresponding width (`w` and `state.pageSize[0]`). Declare `const pageWidths: number[] = [];` next to `const pageHeights: number[] = [];`. After the `await stampAndAuthor(...)` call and before `applyDocumentProps(...)`, add:

```ts
	if (state.watermark) drawWatermark(doc, pageWidths, pageHeights, state.watermark);
```

In `buildSourceRebuild`, do the same: declare `const pageWidths: number[] = [];`, push the page width next to each `pageHeights.push(...)` (push `boxW` in the `source` branch and `op.size[0]` in the `blank` branch), and after `await stampAndAuthor(...)`, before `applyDocumentProps(...)`, add the identical `if (state.watermark) drawWatermark(...)` line.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/pdf/build.watermark.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Full build suite + typecheck (no regressions)**

Run: `npm run check && npx vitest run src/lib/pdf`
Expected: 0 errors; all build tests green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf/build.ts src/lib/pdf/build.watermark.test.ts
git commit -m "feat(watermark): draw centered text watermark on every page"
```

---

### Task B3: Validate `watermark` in the export boundary

**Files:**
- Modify: `src/routes/editor/export-validate.ts`
- Test: `src/routes/editor/export-validate.test.ts`

**Interfaces:**
- Consumes: `validateExportInput`, the existing `STANDARD_FONTS`/font list (if none exists, define a local `const`).
- Produces: 422 on malformed watermark.

- [ ] **Step 1: Write the failing test**

In `src/routes/editor/export-validate.test.ts`, add:

```ts
const wmInput = (wm: unknown) => ({
	state: { pageSize: [595, 842], elements: [], watermark: wm },
	fingerprint: 'fp'
});

it('accepts a valid watermark', () => {
	expect(() =>
		validateExportInput(wmInput({ text: 'DRAFT', size: 48, opacity: 0.3, rotation: 45 }))
	).not.toThrow();
});

it('rejects a watermark with non-string text', () => {
	expect(() => validateExportInput(wmInput({ text: 123 }))).toThrow();
});

it('rejects a watermark with out-of-range opacity', () => {
	expect(() => validateExportInput(wmInput({ text: 'X', opacity: 5 }))).toThrow();
});

it('rejects a watermark with an unknown font', () => {
	expect(() => validateExportInput(wmInput({ text: 'X', font: 'Comic Sans' }))).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/editor/export-validate.test.ts`
Expected: FAIL — the reject cases do not throw.

- [ ] **Step 3: Implement validation**

In `src/routes/editor/export-validate.ts`, add a standard-font constant near the top constants:

```ts
const STANDARD_FONTS = [
	'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
	'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
	'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'
];
```

Add a validator function near `validateMetadata`:

```ts
/** Validate the optional text watermark: capped string + bounded numerics. */
function validateWatermark(wm: unknown): void {
	if (!wm || typeof wm !== 'object') error(422, 'Invalid watermark');
	const w = wm as {
		text?: unknown; font?: unknown; size?: unknown;
		color?: unknown; opacity?: unknown; rotation?: unknown;
	};
	if (typeof w.text !== 'string') error(422, 'Invalid watermark text');
	if ((w.text as string).length > MAX_TEXT_LEN) error(422, 'Watermark text too large');
	if (w.font !== undefined && !STANDARD_FONTS.includes(w.font as string)) {
		error(422, 'Invalid watermark font');
	}
	if (w.size !== undefined && !isFiniteNumber(w.size)) error(422, 'Invalid watermark size');
	if (w.rotation !== undefined && !isFiniteNumber(w.rotation)) {
		error(422, 'Invalid watermark rotation');
	}
	if (w.opacity !== undefined) {
		if (!isFiniteNumber(w.opacity) || w.opacity < 0 || w.opacity > 1) {
			error(422, 'Invalid watermark opacity');
		}
	}
	if (w.color !== undefined) {
		const c = w.color as { r?: unknown; g?: unknown; b?: unknown };
		if (!c || typeof c !== 'object' || !isFiniteNumber(c.r) || !isFiniteNumber(c.g) || !isFiniteNumber(c.b)) {
			error(422, 'Invalid watermark color');
		}
	}
}
```

Then call it in `validateExportInput`, before the final `return`, next to the `flatten` check:

```ts
	if (state.watermark !== undefined) validateWatermark(state.watermark);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/editor/export-validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/export-validate.ts src/routes/editor/export-validate.test.ts
git commit -m "feat(watermark): validate watermark in export boundary"
```

---

### Task B4: Watermark editor state + export wiring

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts`

**Interfaces:**
- Produces: `EditorState.watermark: Watermark | null` ($state), `EditorState.watermarkModalOpen: boolean` ($state); `state.watermark` shipped when set and text non-empty.

- [ ] **Step 1: Import the type**

In `src/routes/editor/editor.svelte.ts`, add `Watermark` to the existing type import from `$lib/pdf/types` (the import block around line 4).

- [ ] **Step 2: Add state**

Near the document-level state (after the `flatten` field from Task A3), add:

```ts
	/** Optional text watermark stamped on every page at export. */
	watermark = $state<Watermark | null>(null);
	/** True while the watermark editor modal is open. */
	watermarkModalOpen = $state(false);
```

- [ ] **Step 3: Include it in the exported state**

In `export()`, in the `state` object literal, after the `flatten` line, add (omit when null or text is blank):

```ts
				...(this.watermark && this.watermark.text.trim().length > 0
					? { watermark: $state.snapshot(this.watermark) as Watermark }
					: {})
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/editor.svelte.ts
git commit -m "feat(watermark): editor state + export wiring"
```

---

### Task B5: Watermark modal + Document-menu trigger

**Files:**
- Create: `src/routes/editor/WatermarkModal.svelte`
- Modify: `src/routes/editor/Toolbar.svelte` (Document menu item)
- Modify: `src/routes/editor/+page.svelte` (mount modal)
- Test: `src/routes/editor/WatermarkModal.svelte.test.ts` (create)

**Interfaces:**
- Consumes: `EditorState.watermark`, `EditorState.watermarkModalOpen`.
- Produces: a modal that creates/edits/removes `editor.watermark`.

- [ ] **Step 1: Create the modal component**

Create `src/routes/editor/WatermarkModal.svelte`:

```svelte
<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { StandardFontName } from '$lib/pdf/types';

	let { editor }: { editor: EditorState } = $props();

	const open = $derived(editor.watermarkModalOpen);

	const fonts: StandardFontName[] = [
		'Helvetica-Bold', 'Helvetica', 'Times-Bold', 'Times-Roman', 'Courier-Bold'
	];

	function toHex(c: { r: number; g: number; b: number } | undefined): string {
		const v = c ?? { r: 0.5, g: 0.5, b: 0.5 };
		const h = (n: number) =>
			Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
		return `#${h(v.r)}${h(v.g)}${h(v.b)}`;
	}
	function fromHex(hex: string): { r: number; g: number; b: number } {
		return {
			r: parseInt(hex.slice(1, 3), 16) / 255,
			g: parseInt(hex.slice(3, 5), 16) / 255,
			b: parseInt(hex.slice(5, 7), 16) / 255
		};
	}

	// A default watermark used when enabling from scratch.
	function ensure() {
		if (!editor.watermark) {
			editor.watermark = { text: 'DRAFT', font: 'Helvetica-Bold', size: 48, opacity: 0.3, rotation: 45, color: { r: 0.5, g: 0.5, b: 0.5 } };
		}
	}

	function close() {
		editor.watermarkModalOpen = false;
	}
	function remove() {
		editor.watermark = null;
		editor.watermarkModalOpen = false;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => { if (e.target === e.currentTarget) close(); }}
	>
		<div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
			<h2 class="mb-4 text-base font-semibold text-gray-900">Watermark</h2>

			{#if !editor.watermark}
				<p class="mb-4 text-sm text-gray-600">No watermark on this document.</p>
				<button
					type="button"
					class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					onclick={ensure}
				>
					Add watermark
				</button>
			{:else}
				{@const wm = editor.watermark}
				<div class="flex flex-col gap-3">
					<label class="flex flex-col gap-1">
						<span class="text-xs font-medium text-gray-600">Text</span>
						<input
							type="text"
							class="rounded border border-gray-300 px-2 py-1.5 text-sm"
							value={wm.text}
							oninput={(e) => (wm.text = (e.currentTarget as HTMLInputElement).value)}
						/>
					</label>
					<div class="flex items-center gap-3">
						<label class="flex flex-1 flex-col gap-1">
							<span class="text-xs font-medium text-gray-600">Font</span>
							<select
								class="rounded border border-gray-300 px-2 py-1.5 text-sm"
								value={wm.font ?? 'Helvetica-Bold'}
								onchange={(e) => (wm.font = (e.currentTarget as HTMLSelectElement).value as StandardFontName)}
							>
								{#each fonts as f (f)}<option value={f}>{f}</option>{/each}
							</select>
						</label>
						<label class="flex w-24 flex-col gap-1">
							<span class="text-xs font-medium text-gray-600">Size</span>
							<input
								type="number" min="6" max="300"
								class="rounded border border-gray-300 px-2 py-1.5 text-sm"
								value={wm.size ?? 48}
								oninput={(e) => (wm.size = Number((e.currentTarget as HTMLInputElement).value))}
							/>
						</label>
					</div>
					<div class="flex items-center gap-4">
						<label class="flex items-center gap-2 text-sm">
							<span class="text-xs font-medium text-gray-600">Color</span>
							<input
								type="color"
								value={toHex(wm.color)}
								oninput={(e) => (wm.color = fromHex((e.currentTarget as HTMLInputElement).value))}
								class="h-6 w-6 cursor-pointer rounded border"
								aria-label="Watermark color"
							/>
						</label>
						<label class="flex w-28 flex-col gap-1">
							<span class="text-xs font-medium text-gray-600">Rotation°</span>
							<input
								type="number" min="-180" max="180"
								class="rounded border border-gray-300 px-2 py-1.5 text-sm"
								value={wm.rotation ?? 45}
								oninput={(e) => (wm.rotation = Number((e.currentTarget as HTMLInputElement).value))}
							/>
						</label>
					</div>
					<label class="flex flex-col gap-1">
						<span class="text-xs font-medium text-gray-600">Opacity {Math.round((wm.opacity ?? 0.3) * 100)}%</span>
						<input
							type="range" min="0" max="1" step="0.05"
							value={wm.opacity ?? 0.3}
							oninput={(e) => (wm.opacity = Number((e.currentTarget as HTMLInputElement).value))}
							aria-label="Watermark opacity"
						/>
					</label>
				</div>
			{/if}

			<div class="mt-5 flex justify-between">
				<button
					type="button"
					class="rounded px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
					disabled={!editor.watermark}
					onclick={remove}
				>
					Remove
				</button>
				<button
					type="button"
					class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					onclick={close}
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}
```

- [ ] **Step 2: Mount the modal**

In `src/routes/editor/+page.svelte`, add the import next to the other modal imports (~line 10):

```ts
	import WatermarkModal from './WatermarkModal.svelte';
```

And mount it next to the others (~line 140, after `<DocumentPropertiesModal {editor} />`):

```svelte
	<WatermarkModal {editor} />
```

- [ ] **Step 3: Add the Document-menu trigger**

In `src/routes/editor/Toolbar.svelte`, in the Document dropdown, after the "Outline / bookmarks…" button block, add:

```svelte
					<button
						class={menuItem}
						role="menuitem"
						onclick={() => {
							editor.watermarkModalOpen = true;
							docMenuOpen = false;
						}}
					>
						Watermark…
					</button>
```

- [ ] **Step 4: Write the component test**

Create `src/routes/editor/WatermarkModal.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

import WatermarkModal from './WatermarkModal.svelte';
import { EditorState } from './editor.svelte';

function openModal() {
	const editor = new EditorState();
	editor.watermarkModalOpen = true;
	flushSync();
	return editor;
}

describe('WatermarkModal', () => {
	it('adds a default watermark', async () => {
		const user = userEvent.setup();
		const editor = openModal();
		render(WatermarkModal, { props: { editor } });
		await user.click(screen.getByRole('button', { name: 'Add watermark' }));
		flushSync();
		expect(editor.watermark?.text).toBe('DRAFT');
	});

	it('removes the watermark', async () => {
		const user = userEvent.setup();
		const editor = openModal();
		editor.watermark = { text: 'DRAFT' };
		flushSync();
		render(WatermarkModal, { props: { editor } });
		await user.click(screen.getByRole('button', { name: 'Remove' }));
		flushSync();
		expect(editor.watermark).toBeNull();
	});
});
```

- [ ] **Step 5: Run the component test**

Run: `npx vitest run src/routes/editor/WatermarkModal.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/editor/WatermarkModal.svelte src/routes/editor/+page.svelte src/routes/editor/Toolbar.svelte src/routes/editor/WatermarkModal.svelte.test.ts
git commit -m "feat(watermark): editor modal + document-menu trigger"
```

---

### Task B6: Canvas watermark preview overlay

**Files:**
- Create: `src/routes/editor/overlays/WatermarkOverlay.svelte`
- Modify: `src/routes/editor/Canvas.svelte`

**Interfaces:**
- Consumes: `EditorState.watermark`, the per-page `{ width, height }` in `Canvas.svelte`'s `{#each editor.pages …}` loop, and `SCALE` from `../constants`.
- Produces: a non-interactive, centered, rotated, semi-transparent text preview per page. Mirrors the export's center math.

**Note on rotation sign:** the build negates the editor angle because the lib rotates counter-clockwise; CSS `rotate()` is clockwise, so the overlay uses the editor angle **as-is** (positive = clockwise), matching the build's net visual result.

- [ ] **Step 1: Create the overlay**

Create `src/routes/editor/overlays/WatermarkOverlay.svelte`:

```svelte
<script lang="ts">
	import type { Watermark } from '$lib/pdf/types';
	import { SCALE } from '../constants';

	// `pageWidth`/`pageHeight` are unzoomed canvas px (already × SCALE by caller).
	let { watermark, pageWidth, pageHeight }: {
		watermark: Watermark; pageWidth: number; pageHeight: number;
	} = $props();

	const text = $derived(watermark.text.trim());
	const sizePx = $derived((watermark.size ?? 48) * SCALE);
	const opacity = $derived(watermark.opacity ?? 0.3);
	const rotation = $derived(watermark.rotation ?? 45);

	function rgbCss(c: { r: number; g: number; b: number } | undefined): string {
		const v = c ?? { r: 0.5, g: 0.5, b: 0.5 };
		const n = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
		return `rgb(${n(v.r)} ${n(v.g)} ${n(v.b)})`;
	}
	function fontFamily(f: string | undefined): string {
		if (f?.startsWith('Times')) return 'Georgia, "Times New Roman", serif';
		if (f?.startsWith('Courier')) return 'monospace';
		return 'Helvetica, Arial, sans-serif';
	}
	const weight = $derived(watermark.font?.includes('Bold') ? 700 : 400);
</script>

{#if text.length > 0}
	<div
		class="pointer-events-none absolute top-1/2 left-1/2 select-none whitespace-nowrap"
		style="transform: translate(-50%, -50%) rotate({rotation}deg);
			font-size: {sizePx}px; line-height: 1; opacity: {opacity};
			color: {rgbCss(watermark.color)}; font-family: {fontFamily(watermark.font)};
			font-weight: {weight}; width: {pageWidth}px; height: {pageHeight}px;
			display: flex; align-items: center; justify-content: center;"
	>
		{text}
	</div>
{/if}
```

- [ ] **Step 2: Wire it into Canvas**

In `src/routes/editor/Canvas.svelte`, add the import near `import { overlayFor } from './overlays';`:

```ts
	import WatermarkOverlay from './overlays/WatermarkOverlay.svelte';
```

Inside the per-page `<div>` (the `{#each editor.pages as page, pageIndex …}` block), after the elements `{#each editor.elementsForPage(pageIndex) …}{/each}` and before the `FloatingToolbar` `{#if}`, add:

```svelte
				{#if editor.watermark}
					<WatermarkOverlay
						watermark={editor.watermark}
						pageWidth={page.width * SCALE}
						pageHeight={page.height * SCALE}
					/>
				{/if}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run `npm run dev`, open the editor, Document ▾ → Watermark… → Add watermark, type "DRAFT". Confirm a rotated gray "DRAFT" appears centered on each page and updates as you change size/rotation/opacity.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/overlays/WatermarkOverlay.svelte src/routes/editor/Canvas.svelte
git commit -m "feat(watermark): canvas preview overlay"
```

---

### Task B7: Full verification

- [ ] **Step 1: Typecheck + full test suite**

Run: `npm run check && npx vitest run`
Expected: 0 type errors; all tests pass.

- [ ] **Step 2: Commit any incidental fixes**

If the previous step surfaced fixes, commit them with a clear message. Otherwise skip.

---

## Notes for the implementer
- Task A1 and B2 both edit `buildPdf`/build functions; do A1 first (it restructures `buildPdf`'s return), then B2 builds on that structure.
- Tasks within a feature are ordered; A-tasks and B-tasks are independent except that B1 adds `watermark` to `EditState` right after the `flatten` field A1 adds — if executing B before A, place the field appropriately and adjust the export wiring order.
- The lib's `getFont`, `widthOfTextAtSize`, `drawText({rotate, opacity})`, `getForm().flatten()`, and `getForm().getFields()` are all confirmed present in `@ignaciano3/better-pdf` 1.1.
