# Incremental Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export loaded PDFs by mutating them in place (append-only incremental save via better-pdf ≥1.9's `createForm()`-on-`load()`), preserving the original document and its existing form fields, instead of rebuilding a fresh PDF every time.

**Architecture:** A pure classifier (`planExport`) decides per-export between the existing rebuild and a new incremental path, based on a provenance snapshot of the fields extracted at load time. The incremental path loads (or `assemble`s, for multi-source/reordered page structures) the source, stamps elements, authors only *new* fields, fills value-only changes on source fields, and saves append-only. The "Optimize file size" toggle is renamed "Compact PDF structure" and becomes the explicit opt-in to the rebuild.

**Tech Stack:** SvelteKit (Svelte 5 runes), `@ignaciano3/better-pdf` 1.12.0, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-07-08-incremental-export-design.md` — read it first.

## Global Constraints

- Use `bun` (never npm/pnpm) for everything: `bun run test`, `bun x prettier`.
- Run prettier only on files you touched (repo is not prettier-clean): `bun x prettier --write <files>`.
- Tests run with `bun run test:unit -- --run <path>` (vitest). Full suite: `bun run test`.
- better-pdf 1.9.0 contract: on a loaded doc, ALL `createForm()` field additions must precede the first `getForm()` call; `getForm()` is then used for fills/multi-select/flatten.
- `objectStreams` is ignored on incremental saves — never pass it there.
- Toggle copy (exact): label `Compact PDF structure`, described in Task 7.
- Error copy for source-name collisions (exact): `This name already exists in the original PDF.`
- Commit after every task with the message given in its final step.

---

### Task 1: `planExport` classifier

**Files:**
- Create: `src/lib/pdf/export-plan.ts`
- Modify: `src/lib/pdf/types.ts` (add `EditState.sourceFields`)
- Test: `src/lib/pdf/export-plan.test.ts`

**Interfaces:**
- Consumes: `EditState`, `FieldElement`, `PageOp` from `src/lib/pdf/types.ts`.
- Produces: `planExport(state: EditState): ExportPlan` where

```ts
export type ExportPlan =
	| { mode: 'blank' }
	| { mode: 'rebuild'; reason: string }
	| {
			mode: 'incremental';
			/** Field elements not present in the source snapshot — author via createForm(). */
			newFields: FieldElement[];
			/** Source fields whose only change is value/selectedValues — fill via getForm(). */
			valueFills: FieldElement[];
	  };
```

- [ ] **Step 1: Add `sourceFields` to `EditState`**

In `src/lib/pdf/types.ts`, next to the existing `sources` member of `EditState`, add:

```ts
	/**
	 * Snapshot of the field elements extracted from source 0 at load time
	 * (provenance for the incremental export path). An element whose id appears
	 * here originated in the source PDF: unchanged → skipped (the source already
	 * has it), value-only change → filled via getForm(), structural change or
	 * deletion → the export falls back to the full rebuild. Absent for blank
	 * documents and legacy states.
	 */
	sourceFields?: FieldElement[];
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/pdf/export-plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planExport } from './export-plan';
import type { EditState, FieldElement } from './types';

function field(over: Partial<FieldElement> & Pick<FieldElement, 'field' | 'name'>): FieldElement {
	return {
		type: 'field',
		id: over.name,
		x: 20,
		y: 20,
		width: 120,
		height: 22,
		page: 0,
		...over
	};
}

const SRC = new Uint8Array([1, 2, 3]); // classifier never parses bytes

function base(over: Partial<EditState> = {}): EditState {
	return { pageSize: [400, 500], elements: [], sources: [SRC], ...over };
}

describe('planExport', () => {
	it('no sources → blank', () => {
		expect(planExport({ pageSize: [400, 500], elements: [] })).toEqual({ mode: 'blank' });
	});

	it('objectStreams on → rebuild', () => {
		const plan = planExport(base({ objectStreams: true }));
		expect(plan.mode).toBe('rebuild');
	});

	it('rotation/size page ops → rebuild', () => {
		const rot = planExport(
			base({ pageOps: [{ kind: 'source', sourceIndex: 0, rotation: 90, docIndex: 0 }] })
		);
		expect(rot.mode).toBe('rebuild');
		const sized = planExport(
			base({ pageOps: [{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 0, size: [300, 300] }] })
		);
		expect(sized.mode).toBe('rebuild');
	});

	it('new fields only → incremental with newFields', () => {
		const f = field({ field: 'text', name: 'nnew1' });
		const plan = planExport(base({ elements: [f] }));
		expect(plan).toEqual({ mode: 'incremental', newFields: [f], valueFills: [] });
	});

	it('unchanged source field → skipped (neither authored nor filled)', () => {
		const snap = field({ field: 'text', name: 'orig', value: 'a' });
		const plan = planExport(base({ elements: [snap], sourceFields: [snap] }));
		expect(plan).toEqual({ mode: 'incremental', newFields: [], valueFills: [] });
	});

	it('value-only change on source field → valueFills', () => {
		const snap = field({ field: 'text', name: 'orig', value: 'a' });
		const edited = { ...snap, value: 'b' };
		const plan = planExport(base({ elements: [edited], sourceFields: [snap] }));
		expect(plan).toEqual({ mode: 'incremental', newFields: [], valueFills: [edited] });
	});

	it('structural change on source field → rebuild', () => {
		const snap = field({ field: 'text', name: 'orig' });
		const moved = { ...snap, x: 99 };
		expect(planExport(base({ elements: [moved], sourceFields: [snap] })).mode).toBe('rebuild');
		const renamed = { ...snap, name: 'other' };
		expect(planExport(base({ elements: [renamed], sourceFields: [snap] })).mode).toBe('rebuild');
	});

	it('deleted source field → rebuild', () => {
		const snap = field({ field: 'text', name: 'orig' });
		expect(planExport(base({ elements: [], sourceFields: [snap] })).mode).toBe('rebuild');
	});

	it('multi-source with a source-field value change → rebuild', () => {
		const snap = field({ field: 'text', name: 'orig', value: 'a' });
		const edited = { ...snap, value: 'b' };
		const plan = planExport(
			base({ sources: [SRC, SRC], elements: [edited], sourceFields: [snap] })
		);
		expect(plan.mode).toBe('rebuild');
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test:unit -- --run src/lib/pdf/export-plan.test.ts`
Expected: FAIL — `Cannot find module './export-plan'` (or similar).

- [ ] **Step 4: Implement `src/lib/pdf/export-plan.ts`**

```ts
import type { EditState, FieldElement } from './types';

/** Decision for one export: see the 2026-07-08 incremental-export spec. */
export type ExportPlan =
	| { mode: 'blank' }
	| { mode: 'rebuild'; reason: string }
	| { mode: 'incremental'; newFields: FieldElement[]; valueFills: FieldElement[] };

/**
 * Classify an export as blank / rebuild / incremental. Pure: never parses PDF
 * bytes — page-level guards that need the loaded document (intrinsic /Rotate)
 * are enforced by the builder, which falls back to the rebuild itself.
 */
export function planExport(state: EditState): ExportPlan {
	const sources =
		state.sources && state.sources.length > 0
			? state.sources
			: state.sourcePdf && state.sourcePdf.byteLength > 0
				? [state.sourcePdf]
				: [];
	if (!sources.some((s) => s && s.byteLength > 0)) return { mode: 'blank' };
	if (state.objectStreams) return { mode: 'rebuild', reason: 'compact-structure' };
	for (const op of state.pageOps ?? []) {
		if (op.rotation) return { mode: 'rebuild', reason: 'page-rotation' };
		if (op.kind === 'source' && op.size) return { mode: 'rebuild', reason: 'page-resize' };
	}

	const snapshots = new Map((state.sourceFields ?? []).map((f) => [f.id, f]));
	const seen = new Set<string>();
	const newFields: FieldElement[] = [];
	const valueFills: FieldElement[] = [];
	for (const el of state.elements) {
		if (el.type !== 'field') continue;
		const snap = snapshots.get(el.id);
		if (!snap) {
			newFields.push(el);
			continue;
		}
		seen.add(el.id);
		if (structurallyEqual(el, snap)) {
			if (!valueEqual(el, snap)) valueFills.push(el);
		} else {
			return { mode: 'rebuild', reason: 'source-field-structural-change' };
		}
	}
	for (const id of snapshots.keys()) {
		if (!seen.has(id)) return { mode: 'rebuild', reason: 'source-field-deleted' };
	}
	if (valueFills.length > 0 && sources.length > 1) {
		// assemble may prefix-rename colliding source fields; don't chase renames.
		return { mode: 'rebuild', reason: 'multi-source-value-fill' };
	}
	return { mode: 'incremental', newFields, valueFills };
}

/** Everything except value/selectedValues must match for a source field to stay incremental. */
function structurallyEqual(a: FieldElement, b: FieldElement): boolean {
	return stripValues(a) === stripValues(b);
}

function valueEqual(a: FieldElement, b: FieldElement): boolean {
	return (
		(a.value ?? '') === (b.value ?? '') &&
		JSON.stringify(a.selectedValues ?? []) === JSON.stringify(b.selectedValues ?? [])
	);
}

function stripValues(f: FieldElement): string {
	const { value: _v, selectedValues: _s, ...rest } = f;
	return JSON.stringify(rest, Object.keys(rest).sort());
}
```

Note: `JSON.stringify(obj, sortedKeys)` with an array replacer only serializes
listed keys of *nested* objects too — since `FieldElement` nests `border`,
`radioLayout`, etc., collect keys recursively instead if tests show missed
diffs. If `stripValues` proves fragile, replace with an explicit key list
comparison over: `field, name, x, y, width, height, page, required, readOnly,
tooltip, maxLength, multiline, comb, align, fontSize, font, password,
defaultValue, options, multiSelect, checkStyle, defaultChecked,
defaultSelected, border, background, textColor, radioLayout` (compare each via
`JSON.stringify`). The tests in Step 2 must pass either way.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/lib/pdf/export-plan.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/export-plan.ts src/lib/pdf/export-plan.test.ts src/lib/pdf/types.ts
git commit -m "feat(pdf): planExport classifier for incremental vs rebuild export"
```

---

### Task 2: Incremental builder — identity single source

**Files:**
- Modify: `src/lib/pdf/build.ts`
- Test: `src/lib/pdf/build.incremental.test.ts`

**Interfaces:**
- Consumes: `planExport`/`ExportPlan` from Task 1; existing `finishDoc` internals (`embedFonts`, `drawWatermark`, `applyDocumentProps`, `collectMultiSelections`, `authorField`, `renderElement`, `dataUrlToBytes`, `topLeftToPdfY`).
- Produces: `buildPdf(state)` transparently routes to the incremental path; no signature change. Internal `buildIncremental(state, sources, plan)` (not exported).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pdf/build.incremental.test.ts`. The source fixture is built with the library itself:

```ts
import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState, FieldElement } from './types';

function field(over: Partial<FieldElement> & Pick<FieldElement, 'field' | 'name'>): FieldElement {
	return {
		type: 'field',
		id: over.name,
		x: 20,
		y: 20,
		width: 120,
		height: 22,
		page: 0,
		...over
	};
}

/** A one-page source PDF containing a text field `existing` (value "orig"). */
async function makeSource(): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	doc.addPage([400, 500]);
	const form = doc.createForm();
	form.addTextField('existing', { page: 0, x: 20, y: 400, width: 120, height: 22, value: 'orig' });
	return doc.save();
}

/** Snapshot matching what the editor would hold for the source field. The
 *  incremental path only compares elements against this snapshot; exact
 *  coordinates don't matter as long as element and snapshot agree. */
const SNAP = field({ field: 'text', name: 'existing', value: 'orig', y: 78 });

describe('buildPdf incremental path', () => {
	it('appends a new field while preserving the existing one (no re-author)', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [SNAP, field({ field: 'text', name: 'added', value: 'hi', y: 120 })]
		};
		const bytes = await buildPdf(state);

		// Incremental saves are append-only: the original bytes are a prefix.
		expect(bytes.byteLength).toBeGreaterThan(source.byteLength);
		expect(Array.from(bytes.slice(0, source.byteLength))).toEqual(Array.from(source));

		const doc = await PdfDocument.load(bytes);
		const fields = doc.getForm().getFields();
		const names = fields.map((f) => f.name).sort();
		expect(names).toEqual(['added', 'existing']); // exactly one copy of each
		expect(fields.find((f) => f.name === 'existing')?.value).toBe('orig');
		expect(fields.find((f) => f.name === 'added')?.value).toBe('hi');
	});

	it('fills a value-only change on a source field', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [{ ...SNAP, value: 'updated' }]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getForm().getTextField('existing').value).toBe('updated');
	});

	it('falls back to rebuild on structural change (source field dropped, edited copy authored)', async () => {
		const source = await makeSource();
		const moved = { ...SNAP, x: 200 };
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [moved]
		};
		const bytes = await buildPdf(state);
		// Rebuild output is NOT an append of the source.
		expect(Array.from(bytes.slice(0, source.byteLength))).not.toEqual(Array.from(source));
		const doc = await PdfDocument.load(bytes);
		const fields = doc.getForm().getFields();
		expect(fields.map((f) => f.name)).toEqual(['existing']); // re-authored once
	});

	it('flatten on incremental bakes both original and new fields', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [SNAP, field({ field: 'text', name: 'added', value: 'hi', y: 120 })],
			flatten: true
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getForm().getFields().length).toBe(0);
	});

	it('stamps text elements and applies metadata incrementally', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [
				SNAP,
				{ type: 'text', id: 't1', x: 30, y: 30, page: 0, text: 'stamped', size: 14 }
			],
			metadata: { title: 'Inc Title' }
		};
		const bytes = await buildPdf(state);
		expect(Array.from(bytes.slice(0, source.byteLength))).toEqual(Array.from(source));
		const doc = await PdfDocument.load(bytes);
		expect(doc.getMetadata().title).toBe('Inc Title');
	});
});
```

Adjust the `text` element literal to this repo's `TextElement` shape if it has
required members beyond these (check `src/lib/pdf/types.ts` — e.g. `color`,
`font`); the intent is any minimal valid text stamp.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- --run src/lib/pdf/build.incremental.test.ts`
Expected: FAIL — today `buildPdf` always rebuilds, so the append-only prefix assertion and the single-copy `['added', 'existing']` assertion fail.

- [ ] **Step 3: Implement the incremental path in `build.ts`**

3a. Import the classifier at the top of `src/lib/pdf/build.ts`:

```ts
import { planExport, type ExportPlan } from './export-plan';
```

3b. Replace the body of `buildPdf` (and update its docstring — the "always a rebuild (D3)" paragraph is no longer true; describe the three-way dispatch and that D3 remains as the compact/fallback path):

```ts
export async function buildPdf(state: EditState): Promise<Uint8Array> {
	const sources = resolveSources(state);
	const plan = planExport(state);
	if (plan.mode === 'blank') return buildBlankRebuild(state);
	if (plan.mode === 'rebuild') return buildSourceRebuild(state, sources);
	try {
		const result = await buildIncremental(state, sources, plan);
		if (result) return result;
	} catch (cause) {
		if (cause instanceof PdfBuildError) throw cause;
		// Unexpected incremental failure: the rebuild path is the safe fallback.
	}
	return buildSourceRebuild(state, sources);
}
```

3c. Add `buildIncremental`. It returns `null` when a load-time guard says the
document isn't incremental-safe (intrinsic page rotation):

```ts
/**
 * Incremental export (spec 2026-07-08): mutate the loaded source in place and
 * save append-only. Preconditions guaranteed by planExport: no objectStreams,
 * no rotation/resize page ops, no structural source-field changes. Returns
 * null when a load-time guard (intrinsic page /Rotate) rules the document out,
 * so the caller falls back to the rebuild.
 */
async function buildIncremental(
	state: EditState,
	sources: Uint8Array[],
	plan: Extract<ExportPlan, { mode: 'incremental' }>
): Promise<Uint8Array | null> {
	const doc = await loadForIncremental(state, sources);
	if (!doc) return null;

	const pages = doc.getPages();
	if (pages.some((p) => p.rotation !== 0)) return null; // conservative guard (spec)
	const pageWidths = pages.map((p) => p.width);
	const pageHeights = pages.map((p) => p.height);

	const fonts = await embedFonts(doc, state.fonts);

	// Stamp non-field elements and signature PNGs; author ONLY the new fields.
	// (Source-origin fields are already inside the loaded document.)
	const pageCount = pageHeights.length;
	const newIds = new Set(plan.newFields.map((f) => f.id));
	for (const element of state.elements) {
		if (element.type === 'field') continue;
		const pageIndex = element.page ?? 0;
		if (pageIndex < 0 || pageIndex >= pageCount) continue;
		const page = doc.getPage(pageIndex);
		await renderElement(
			{ doc, page, pageHeight: pageHeights[pageIndex] as number, fonts },
			element
		);
	}
	for (const f of plan.newFields) {
		if (f.field !== 'signature') continue;
		const bytes = dataUrlToBytes(f.value);
		if (!bytes) continue;
		const pageIndex = f.page ?? 0;
		if (pageIndex < 0 || pageIndex >= pageCount) continue;
		try {
			const img = await doc.embedPng(bytes);
			doc.getPage(pageIndex).drawImage(img, {
				x: f.x,
				y: topLeftToPdfY(f.y, f.height, pageHeights[pageIndex] as number),
				width: f.width,
				height: f.height
			});
		} catch {
			// Undecodable signature PNG — skip drawing; the field is still authored.
		}
	}
	if (plan.newFields.length > 0) {
		const form = doc.createForm();
		for (const f of plan.newFields) {
			if ((f.page ?? 0) < 0 || (f.page ?? 0) >= pageCount) continue;
			authorField(form, f, pageHeights);
		}
	}

	if (state.watermark) await drawWatermark(doc, pageWidths, pageHeights, state.watermark);
	applyDocumentProps(doc, state.metadata, state.outline, pageHeights.length);

	// getForm() comes strictly after every createForm() addition (1.9.0 contract).
	const multi = collectMultiSelections(state.elements.filter((e) => e.type === 'field' && newIds.has(e.id)));
	const hasAnyField = state.elements.some((e) => e.type === 'field') || Boolean(state.sourceFields?.length);
	const doFlatten = Boolean(state.flatten) && hasAnyField;
	if (plan.valueFills.length > 0 || multi.length > 0 || doFlatten) {
		const form = doc.getForm();
		for (const f of plan.valueFills) fillField(form, f);
		for (const { name, values } of multi) form.getListBox(name).selectMultiple(values);
		if (doFlatten) form.flatten();
	}
	return doc.save(); // append-only; objectStreams intentionally never passed
}

/** Apply a value-only change to a field that already exists in the loaded doc. */
function fillField(form: ReturnType<PdfDocument['getForm']>, f: FieldElement): void {
	switch (f.field) {
		case 'text':
			form.getTextField(f.name).setText(f.value ?? '');
			break;
		case 'checkbox':
			f.value ? form.getCheckBox(f.name).check() : form.getCheckBox(f.name).uncheck();
			break;
		case 'radio':
			if (f.value) form.getRadioGroup(f.name).select(f.value);
			break;
		case 'dropdown':
		case 'combo':
			if (f.value) form.getDropdown(f.name).select(f.value);
			break;
		case 'listbox':
			if (f.multiSelect) {
				const values = (f.selectedValues ?? []).filter((v) => (f.options ?? []).includes(v));
				if (values.length > 0) form.getListBox(f.name).selectMultiple(values);
			} else if (f.value) {
				form.getListBox(f.name).select(f.value);
			}
			break;
		case 'signature':
			break; // no value fill for signature widgets
	}
}
```

3d. Add `loadForIncremental` — Task 2 only needs the identity case; Task 3 extends it:

```ts
/**
 * Open the document for the incremental path. Identity page structure over a
 * single source loads the bytes directly (fully append-only). Task 3 adds the
 * assemble path for multi-source / reordered structures.
 */
async function loadForIncremental(
	state: EditState,
	sources: Uint8Array[]
): Promise<PdfDocument | null> {
	const ops = state.pageOps ?? [];
	const identity =
		sources.length === 1 &&
		(ops.length === 0 ||
			(ops.every((op, i) => op.kind === 'source' && (op.docIndex ?? 0) === 0 && op.sourceIndex === i && !op.rotation && !op.size) &&
				ops.length === (await PdfDocument.load(sources[0] as Uint8Array)).getPageCount()));
	if (!identity) return null; // Task 3 replaces this with the assemble path
	return PdfDocument.load(sources[0] as Uint8Array);
}
```

(If loading twice to count pages offends, load once and reuse — implementer's
choice; behavior is what the tests check.)

- [ ] **Step 4: Run the new tests and the existing pdf suite**

Run: `bun run test:unit -- --run src/lib/pdf`
Expected: PASS — new incremental tests green; all existing `build.*.test.ts` still green (they have no `sourceFields`, and blank-state tests keep using the create path; source-state tests without `sourceFields` now go incremental — if any of them assert rebuild-specific behavior such as source fields being dropped, read the failure and adjust *that test's state* to set `objectStreams: true` only if the test is explicitly about the rebuild; otherwise the new behavior is the intended one and the assertion should be updated to match the spec).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/build.ts src/lib/pdf/build.incremental.test.ts
git commit -m "feat(pdf): incremental export path — load, author new fields, fill values, append-only save"
```

---

### Task 3: Assemble path for multi-source and reordered pages

**Files:**
- Modify: `src/lib/pdf/build.ts` (`loadForIncremental`)
- Test: `src/lib/pdf/build.incremental.test.ts` (extend)

**Interfaces:**
- Consumes: `PdfDocument.assemble(docs, selections)` (better-pdf ≥1.8.1), `doc.insertPage(index, size)`.
- Produces: `loadForIncremental` handles any pure-selection page structure (reorder, removal, duplication, cross-source interleave, blank pages); still returns `null` only when guards fail upstream (none here — rotation/size ops were already routed to rebuild by `planExport`).

- [ ] **Step 1: Write the failing tests** (append to `build.incremental.test.ts`)

```ts
/** A one-page source with a single text field named `name`. */
async function makeSourceNamed(name: string, pageW = 400): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	doc.addPage([pageW, 500]);
	const form = doc.createForm();
	form.addTextField(name, { page: 0, x: 20, y: 400, width: 120, height: 22 });
	return doc.save();
}

describe('buildPdf incremental path — assemble', () => {
	it('interleaves two sources keeping both fields interactive, plus a new field', async () => {
		const a = await makeSourceNamed('fromA');
		const b = await makeSourceNamed('fromB');
		const state: EditState = {
			pageSize: [400, 500],
			sources: [a, b],
			// B's page first, then A's page — interleaved order across docs.
			pageOps: [
				{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 1 },
				{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 0 }
			],
			elements: [field({ field: 'text', name: 'added', page: 0 })]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getPageCount()).toBe(2);
		const names = doc.getForm().getFields().map((f) => f.name).sort();
		expect(names).toEqual(['added', 'fromA', 'fromB']);
	});

	it('reordered single source goes through assemble and keeps its field', async () => {
		const src = await (async () => {
			const doc = await PdfDocument.create();
			doc.addPage([400, 500]);
			doc.addPage([400, 500]);
			const form = doc.createForm();
			form.addTextField('p0field', { page: 0, x: 20, y: 400, width: 120, height: 22 });
			return doc.save();
		})();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [src],
			pageOps: [
				{ kind: 'source', sourceIndex: 1, rotation: 0, docIndex: 0 },
				{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 0 }
			],
			elements: []
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getPageCount()).toBe(2);
		expect(doc.getForm().getFields().map((f) => f.name)).toEqual(['p0field']);
	});

	it('blank page op inserts a drawable blank page', async () => {
		const a = await makeSourceNamed('fromA');
		const state: EditState = {
			pageSize: [400, 500],
			sources: [a],
			pageOps: [
				{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 0 },
				{ kind: 'blank', size: [300, 300], rotation: 0 }
			],
			elements: [field({ field: 'text', name: 'onBlank', page: 1, x: 10, y: 10 })]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getPageCount()).toBe(2);
		const names = doc.getForm().getFields().map((f) => f.name).sort();
		expect(names).toEqual(['fromA', 'onBlank']);
	});
});
```

Check the exact `PageOp` blank-variant shape in `src/lib/pdf/types.ts` and match it.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bun run test:unit -- --run src/lib/pdf/build.incremental.test.ts`
Expected: the three new tests FAIL (non-identity structures currently return `null` → rebuild → source fields dropped), earlier tests still PASS.

- [ ] **Step 3: Replace `loadForIncremental` with the assemble-aware version**

```ts
/**
 * Open the document for the incremental path. Identity page structure over a
 * single source loads the bytes directly (fully append-only — signatures on
 * the original revision survive). Any other pure-selection structure is
 * assembled first (full-document save: fields stay interactive, signatures do
 * not survive — spec trade-off), then loaded; blank page ops become
 * insertPage() calls on the loaded result.
 */
async function loadForIncremental(
	state: EditState,
	sources: Uint8Array[]
): Promise<PdfDocument | null> {
	const primary = sources[0] as Uint8Array;
	const ops: PageOp[] = state.pageOps && state.pageOps.length > 0 ? [...state.pageOps] : [];
	if (ops.length === 0) return PdfDocument.load(primary);

	const sourceOps = ops.filter((op) => op.kind === 'source');
	const identity =
		sources.length === 1 &&
		ops.length === sourceOps.length &&
		sourceOps.every((op, i) => (op.docIndex ?? 0) === 0 && op.sourceIndex === i);
	if (identity) {
		const doc = await PdfDocument.load(primary);
		// Identity also requires covering every source page (no implicit removal).
		if (doc.getPageCount() === sourceOps.length) return doc;
		// Fall through to assemble via a fresh selection below.
	}

	const selections = sourceOps.map((op) => {
		const docIndex = op.kind === 'source' ? (op.docIndex ?? 0) : 0;
		if (!sources[docIndex]) {
			throw new PdfBuildError('Referenced a source document that was not provided.');
		}
		return { docIndex, pageIndex: op.kind === 'source' ? op.sourceIndex : 0 };
	});
	const assembled = await PdfDocument.assemble(sources, selections);
	const doc = await PdfDocument.load(assembled);
	// Insert blank pages at their output positions (ops order = output order).
	ops.forEach((op, outIndex) => {
		if (op.kind === 'blank') doc.insertPage(outIndex, op.size);
	});
	return doc;
}
```

Note the `ops.forEach` insert order: iterating in output order keeps indices
correct because each insert shifts only later positions, which is exactly
where subsequent blanks land. Verify with the blank-page test.

If `insertPage`'s restructuring is only reflected after save + reload (per the
library README's note on page-structure ops), and the blank-page test fails
because stamps/fields target the wrong page, switch to: perform blank
insertion via `assemble` + a temporary one-page blank PDF (`PdfDocument.create()`
+ `addPage(op.size)` + `save()` appended to `sources` and selected at the blank
positions). That keeps every page-structure change inside `assemble`. Choose
whichever makes the tests pass; document the choice in the code comment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/lib/pdf/build.incremental.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/build.ts src/lib/pdf/build.incremental.test.ts
git commit -m "feat(pdf): assemble-based incremental export for multi-source and reordered pages"
```

---

### Task 4: MissingGlyphError → friendly export error

**Files:**
- Modify: `src/lib/pdf/build.ts`
- Test: `src/lib/pdf/build.font.test.ts` (extend — it already has an embedded-font fixture; reuse it)

**Interfaces:**
- Consumes: `MissingGlyphError` from `@ignaciano3/better-pdf`.
- Produces: `buildPdf` throws `PdfBuildError` with message `The selected font does not contain some of the characters in your text. Change the font or remove the unsupported characters.` whenever the library raises `MissingGlyphError` (any path).

- [ ] **Step 1: Write the failing test**

Open `src/lib/pdf/build.font.test.ts`, find how it loads its TTF fixture (reuse the same helper/bytes), and add:

```ts
it('maps MissingGlyphError to a friendly PdfBuildError', async () => {
	const state: EditState = {
		pageSize: [400, 500],
		fonts: [{ id: 'f1', bytes: FONT_BYTES /* reuse the file's fixture */, name: 'Fixture' }],
		elements: [
			{ type: 'text', id: 't1', x: 20, y: 20, page: 0, text: '\u{1F984}', size: 14, fontId: 'f1' }
		]
	};
	await expect(buildPdf(state)).rejects.toMatchObject({
		name: 'PdfBuildError',
		message: expect.stringContaining('does not contain some of the characters')
	});
});
```

(A unicorn emoji is absent from any ordinary Latin TTF fixture. Match the
`EmbeddedFontAsset` and `TextElement` shapes used elsewhere in this same file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/pdf/build.font.test.ts`
Expected: FAIL — the raw `MissingGlyphError` (or a generic wrap) surfaces, not the friendly message.

- [ ] **Step 3: Implement the mapping**

In `build.ts`: import `MissingGlyphError` from `@ignaciano3/better-pdf`. Wrap the whole dispatch in `buildPdf`:

```ts
export async function buildPdf(state: EditState): Promise<Uint8Array> {
	try {
		return await dispatchBuild(state); // the Task 2 body, extracted as-is
	} catch (cause) {
		if (cause instanceof MissingGlyphError) {
			throw new PdfBuildError(
				'The selected font does not contain some of the characters in your text. Change the font or remove the unsupported characters.',
				{ cause }
			);
		}
		throw cause;
	}
}
```

Also check `buildSourceRebuild`'s catch-all: it wraps unknown errors into
"Could not process the uploaded PDF" — make sure `MissingGlyphError` is
re-thrown there (add `if (cause instanceof MissingGlyphError) throw cause;`
before the generic wrap) so the friendly mapping above wins. Note Task 2's
incremental fallback catch must likewise not swallow it: in the `buildPdf`
dispatch, re-throw `MissingGlyphError` instead of falling back to rebuild
(the rebuild would just hit the same glyph).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/lib/pdf/build.font.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/build.ts src/lib/pdf/build.font.test.ts
git commit -m "feat(pdf): map MissingGlyphError to a friendly export error"
```

---

### Task 5: Editor plumbing — sourceFields snapshot in export state

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts`
- Test: existing suites (`bun run test:unit -- --run src/routes/editor`) must stay green; no new test file (the snapshot is exercised end-to-end by Task 2's build tests).

**Interfaces:**
- Consumes: `extractFields` result (already returns `fields`).
- Produces: `editor.sourceFields: FieldElement[]` state; `EditState.sourceFields` shipped from `export()`.

- [ ] **Step 1: Add the state**

In `editor.svelte.ts` near `sources = $state<Uint8Array[]>([])` (line ~120):

```ts
	/**
	 * Snapshot of the fields extracted from source 0 at load time (provenance
	 * for the incremental export path — see EditState.sourceFields). Never
	 * mutated after load; cleared with the source.
	 */
	sourceFields = $state<FieldElement[]>([]);
```

- [ ] **Step 2: Populate on load, clear on clearSource**

In `loadPdf` (line ~1226), right after `this.elements = detected;`:

```ts
			this.sourceFields = detected.map((f) => ({ ...f }));
```

In `clearSource()` alongside `this.elements = []`:

```ts
		this.sourceFields = [];
```

`appendPdf` does not extract fields, so it leaves `sourceFields` untouched (correct: the snapshot is doc-0 provenance; appended docs' fields never become elements).

- [ ] **Step 3: Ship it from `export()`**

In the `EditState` literal inside `export()` (line ~1505), after the `sources` spread:

```ts
				...(this.sourceFields.length > 0
					? { sourceFields: $state.snapshot(this.sourceFields) as FieldElement[] }
					: {}),
```

Add `FieldElement` to the existing `$lib/pdf/types` type import if missing.

- [ ] **Step 4: Run the editor + pdf suites and typecheck**

Run: `bun run test:unit -- --run src/routes/editor src/lib/pdf && bun run check`
(If the repo has no `check` script, run `bun x svelte-check` — look at `package.json` scripts first.)
Expected: PASS / no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/editor.svelte.ts
git commit -m "feat(editor): snapshot extracted source fields and ship provenance with export state"
```

---

### Task 6: Collision validation against raw source field names

**Files:**
- Modify: `src/routes/editor/extractFields.remote.ts` (return `allNames`)
- Modify: `src/routes/editor/editor.svelte.ts` (store per-doc name lists; `sourceNameTaken`)
- Modify: `src/routes/editor/FieldPropertiesModal.svelte` (validate + message)
- Test: `src/routes/editor/FieldPropertiesModal.svelte.test.ts` (extend)

**Interfaces:**
- Produces: `ExtractFieldsResult.allNames: string[]` (every AcroForm field name, including hidden/pushbutton/unknown ones the mapper skips); `editor.sourceFieldNames: string[][]` (per source doc); `editor.sourceNameTaken(name: string): boolean`.

- [ ] **Step 1: Write the failing modal test**

Open `FieldPropertiesModal.svelte.test.ts`, copy its setup pattern (how it constructs the editor and opens the modal), and add a test:

```ts
it('rejects a name that exists in the original PDF', async () => {
	// setup per the file's existing pattern, then:
	editor.sourceFieldNames = [['hidden_orig']];
	// open modal for a field, type the colliding name into the Name input…
	// assert the alert text:
	expect(screen.getByRole('alert').textContent).toContain(
		'This name already exists in the original PDF.'
	);
});
```

(Adapt mechanically to the file's helpers — the assertion strings are the contract.)

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test:unit -- --run src/routes/editor/FieldPropertiesModal.svelte.test.ts`
Expected: FAIL (no `sourceFieldNames`, no message).

- [ ] **Step 3: Implement**

3a. `extractFields.remote.ts` — add to the interface and both return points:

```ts
	/** Every raw AcroForm field name in the document, including fields the
	 *  mapper skips (hidden widgets, pushbuttons, unknown types). Drives
	 *  editor-side collision validation for the incremental export. */
	allNames: string[];
```

```ts
			const allNames = infos.map((i) => i.name);
			return { fields, pageHeights, allNames };
```

and `return { fields: [], pageHeights: [], allNames: [] };` in the guard/catch.

3b. `editor.svelte.ts`:

```ts
	/** Raw field-name lists per source doc (index = docIndex), for collision validation. */
	sourceFieldNames = $state<string[][]>([]);

	/** True if `name` exists in any loaded source PDF's original AcroForm. */
	sourceNameTaken(name: string): boolean {
		return this.sourceFieldNames.some((names) => names.includes(name));
	}
```

- `loadPdf`: `this.sourceFieldNames = [res.allNames ?? []];` (inside the try that calls `extractFields`; `[[]]` in the catch).
- `clearSource`: `this.sourceFieldNames = [];`
- `appendPdf`: after storing the new source, call `extractFields({ bytes: exportCopy.slice() })` in a try/catch and push `res.allNames ?? []` (or `[]` on failure) at position `docIndex`.
- `uniqueFieldName`: extend `taken` with `this.sourceFieldNames.flat()` so suggested names never collide either.

3c. `FieldPropertiesModal.svelte` — in the `nameError` derived (line ~28), after the duplicate check:

```ts
		if (editor.sourceNameTaken(n) && n !== field?.name)
			return 'This name already exists in the original PDF.';
```

(`n !== field?.name` keeps an extracted field's own unchanged name valid —
extracted fields legitimately carry source names.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/routes/editor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/extractFields.remote.ts src/routes/editor/editor.svelte.ts src/routes/editor/FieldPropertiesModal.svelte src/routes/editor/FieldPropertiesModal.svelte.test.ts
git commit -m "feat(editor): validate field names against the source PDF's raw AcroForm names"
```

---

### Task 7: Rename toggle to "Compact PDF structure"

**Files:**
- Modify: `src/routes/editor/DocumentPropertiesModal.svelte:80-97`
- Modify: `src/lib/pdf/types.ts` (`objectStreams` doc comment), `src/lib/pdf/build.ts:296-301` (finishDoc comment naming the old label)

**Interfaces:** none (copy-only; the `optimizeSize` store field and `objectStreams` wire flag keep their names).

- [ ] **Step 1: Update the modal copy**

Replace the label/help block (currently "Optimize file size (smaller file, PDF 1.5+)" and its description) with:

```svelte
					<span class="text-slate-700">
						Compact PDF structure (rebuilds file, PDF 1.5+)
						<span class="mt-0.5 block text-xs text-slate-500">
							{#if editor.flatten}
								Unavailable while flattening — flattened files can't use this optimization.
							{:else}
								Rebuilds the document with its internal objects packed into compressed
								streams — a marginally smaller file. The original PDF's interactive form
								fields are removed, and a PDF 1.5+ reader is required (not suitable for
								PDF/A archival). Leave off to preserve the original document.
							{/if}
						</span>
					</span>
```

- [ ] **Step 2: Fix stale comments**

- `src/lib/pdf/build.ts` finishDoc docstring: replace `the "Optimize file size" toggle` with `the "Compact PDF structure" toggle`.
- `src/lib/pdf/types.ts` `objectStreams` doc: append a sentence: `Setting this flag also routes the export onto the full-rebuild path (see planExport), since incremental saves cannot use object streams.`

- [ ] **Step 3: Grep for leftovers and run affected tests**

Run: `grep -rn "Optimize file size" src docs/superpowers/plans` → only historical plan docs may match; `src` must be clean.
Run: `bun run test:unit -- --run src/routes/editor`
Expected: PASS (update any modal test asserting the old label text).

- [ ] **Step 4: Commit**

```bash
git add src/routes/editor/DocumentPropertiesModal.svelte src/lib/pdf/build.ts src/lib/pdf/types.ts
git commit -m "feat(editor): rename Optimize file size to Compact PDF structure with honest trade-off copy"
```

---

### Task 8: Full verification pass

**Files:** none new.

- [ ] **Step 1: Full unit suite**

Run: `bun run test`
Expected: PASS. Investigate and fix any failure before proceeding (do not skip tests).

- [ ] **Step 2: Typecheck / svelte-check**

Run the repo's check script from `package.json` (`bun run check` if present, else `bun x svelte-check --tsconfig ./tsconfig.json`).
Expected: no new errors versus main.

- [ ] **Step 3: Prettier touched files only**

```bash
bun x prettier --write src/lib/pdf/export-plan.ts src/lib/pdf/export-plan.test.ts src/lib/pdf/build.ts src/lib/pdf/build.incremental.test.ts src/lib/pdf/types.ts src/routes/editor/editor.svelte.ts src/routes/editor/extractFields.remote.ts src/routes/editor/FieldPropertiesModal.svelte src/routes/editor/DocumentPropertiesModal.svelte
```

- [ ] **Step 4: Commit any formatting fallout**

```bash
git add -u && git commit -m "chore: prettier on incremental-export touched files" || true
```
