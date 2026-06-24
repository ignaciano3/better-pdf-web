# PR1: Editor Polish + Rich Text — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first slice of the editor overhaul — a real home landing, a redesigned header, an explicit Select-default tool model that gates element creation (killing the click=text "lottery" and the shape/click collision), a Sejda-style floating contextual toolbar, and rich static-text properties — backed by Svelte-official unit/component tests.

**Architecture:** All editing stays client-side on the existing `EditorState` runes class (single source of truth). PR1 adds a discriminated `Tool` state that gates creation, moves per-selection controls out of the header into a floating toolbar anchored to the selection, and extends `TextElement` with rich `drawText` properties rendered server-side through `@ignaciano3/better-pdf`. No server/export architecture changes beyond extending the existing `validateElement` gate.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript 6 (strict), Tailwind v4, Vitest 4, `@testing-library/svelte` + `@testing-library/user-event` (jsdom) per the official Svelte testing docs, `@ignaciano3/better-pdf` for PDF writing.

## Global Constraints

- Package manager: **bun** (commands below use `bun`/`bunx`; `npm`/`npx` also work).
- Strict TS: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`, `noPropertyAccessFromIndexSignature`. Use conditional spread (`...(x ? { k: v } : {})`) instead of `k: x ? v : undefined`.
- ESLint rules in force: `svelte/prefer-svelte-reactivity` (no built-in `Map`/`Set` in reactive state — use `Record`/arrays), `svelte/no-navigation-without-resolve` (use `resolve()` from `$app/paths` for links/gotos), `svelte/no-unused-svelte-ignore`.
- Coordinate convention: element `x`/`y` are **top-left origin in PDF points**; the builder flips Y at export (`baselineY = pageHeight - y - size`). `SCALE = 0.8` CSS px per point.
- Every new element field added to the wire must get a matching case in `src/routes/editor/export.remote.ts` `validateElement` or exports 422 (see project memory: export-gate-validation lesson).
- Each task ends green on: `bun run check` (0 errors), `bun run test` (all pass), `bun run lint`.

---

## File Structure

- `vite.config.ts` — add a `client` vitest project (jsdom) for `*.svelte.{test,spec}.ts`; keep `server` project for `*.{test,spec}.ts`.
- `vitest-setup-client.ts` (new) — jsdom test setup (jest-dom matchers).
- `src/routes/editor/constants.ts` — add the `Tool` / `DrawKind` types + `SELECT_TOOL`.
- `src/routes/editor/editor.svelte.ts` — replace `shapeTool` with the unified `tool` model; gate `placeAtClient` / `beginShapeDraw`; add `setTool`/`resetTool`/`activeDrawKind`.
- `src/routes/editor/Canvas.svelte` — drive clicks/pointerdown from `editor.tool`.
- `src/routes/editor/Toolbar.svelte` — redesigned three-zone header; tool buttons in two separated groups; per-selection controls removed.
- `src/routes/editor/FloatingToolbar.svelte` (new) — contextual toolbar anchored to the selection.
- `src/routes/editor/overlays/TextOverlay.svelte` — apply rich text styling in the preview.
- `src/lib/pdf/types.ts` — extend `TextElement` with rich properties; add `StandardFontName`.
- `src/lib/pdf/renderers/text.ts` — pass rich properties to `drawText`.
- `src/routes/+page.svelte` — home landing.
- `src/routes/editor/+page.svelte` — empty-state when no document.
- Tests: `src/routes/editor/editor.svelte.test.ts`, `src/routes/editor/Toolbar.svelte.test.ts`, `src/lib/pdf/build.text-rich.test.ts`, `src/routes/editor/export-validate.test.ts`.

---

## Task 1: Set up Svelte component/runes testing (official)

**Files:**
- Modify: `vite.config.ts`
- Create: `vitest-setup-client.ts`
- Create: `src/routes/editor/editor.svelte.test.ts` (smoke only in this task)

**Interfaces:**
- Produces: a `client` vitest project (jsdom) running `*.svelte.{test,spec}.ts`; `flushSync` (from `svelte`) + `$effect.root` available; `@testing-library/svelte` `render`/`screen` + `@testing-library/user-event`.

- [ ] **Step 1: Install dev dependencies**

```bash
bun add -D jsdom @testing-library/svelte @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Create the client setup file**

Create `vitest-setup-client.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add the client project to `vite.config.ts`**

In `vite.config.ts`, change the `test.projects` array to include both projects (keep the existing `env` block above `projects` unchanged):

```ts
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					environment: 'jsdom',
					// Use browser builds of packages under test (official Svelte guidance).
					resolve: { conditions: ['browser'] },
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
```

- [ ] **Step 4: Write a smoke runes test**

Create `src/routes/editor/editor.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';

// EditorState imports the export command, which pulls the $app/server + db/auth
// graph. The model layer never calls it in these tests, so mock it out.
vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));

import { EditorState } from './editor.svelte';

describe('EditorState smoke', () => {
	it('starts empty with nothing selected', () => {
		const e = new EditorState();
		expect(e.elements).toEqual([]);
		expect(e.selected).toBeNull();
	});
});
```

- [ ] **Step 5: Run the client project**

Run: `bunx vitest run --project client src/routes/editor/editor.svelte.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Confirm the server project still passes**

Run: `bun run test`
Expected: all existing tests PASS; the new client test also runs.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts vitest-setup-client.ts package.json bun.lock src/routes/editor/editor.svelte.test.ts
git commit -m "test: add Svelte client (jsdom) vitest project per official docs"
```

---

## Task 2: Unified Tool model on EditorState

**Files:**
- Modify: `src/routes/editor/constants.ts`
- Modify: `src/routes/editor/editor.svelte.ts`
- Test: `src/routes/editor/editor.svelte.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type DrawKind = 'text' | 'image' | 'signature' | 'line' | 'rectangle' | 'ellipse'`
  - `type Tool = { type: 'select' } | { type: 'draw'; kind: DrawKind }`
  - `const SELECT_TOOL: Tool`
  - On `EditorState`: `tool: Tool` (state), `setTool(tool: Tool): void`, `resetTool(): void`, `activeDrawKind: DrawKind | null` (derived). `placeAtClient` and `beginShapeDraw` are gated by `tool`. `shapeTool`/`setShapeTool` are removed.

- [ ] **Step 1: Write failing tests for the tool model**

Append to `src/routes/editor/editor.svelte.test.ts`:

```ts
import { SELECT_TOOL } from './constants';

function fakePage(): HTMLElement {
	return {
		getBoundingClientRect: () => ({
			left: 0, top: 0, right: 240, bottom: 320, width: 240, height: 320, x: 0, y: 0, toJSON() {}
		})
	} as unknown as HTMLElement;
}

describe('EditorState tool model', () => {
	it('defaults to the select tool', () => {
		const e = new EditorState();
		expect(e.tool).toEqual(SELECT_TOOL);
		expect(e.activeDrawKind).toBeNull();
	});

	it('select tool never creates on a page click', () => {
		const e = new EditorState();
		e.placeAtClient(40, 40, fakePage(), 0);
		flushSync();
		expect(e.elements).toEqual([]);
	});

	it('text tool creates one text element then resets to select (one-shot)', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'text' });
		expect(e.activeDrawKind).toBe('text');
		e.placeAtClient(40, 80, fakePage(), 0);
		flushSync();
		expect(e.elements.length).toBe(1);
		expect(e.elements[0]?.type).toBe('text');
		expect(e.tool).toEqual(SELECT_TOOL);
	});

	it('places a pending image onto page index 1 (multi-page regression)', () => {
		const e = new EditorState();
		// Simulate a loaded 2-page source so page index 1 is valid.
		e.rendered = [
			{ width: 300, height: 400, dataUrl: 'data:,' },
			{ width: 300, height: 400, dataUrl: 'data:,' }
		];
		e.pageOps = [
			{ kind: 'source', sourceIndex: 0, rotation: 0 },
			{ kind: 'source', sourceIndex: 1, rotation: 0 }
		];
		e.pendingImage = { image: new Uint8Array([1, 2, 3]), format: 'png', aspect: 1 };
		e.setTool({ type: 'draw', kind: 'image' });
		e.placeAtClient(20, 20, fakePage(), 1);
		flushSync();
		expect(e.elements.length).toBe(1);
		expect(e.elements[0]?.type).toBe('image');
		expect(e.elements[0]?.page).toBe(1);
		expect(e.elementsForPage(1).length).toBe(1);
		expect(e.elementsForPage(0).length).toBe(0);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run --project client src/routes/editor/editor.svelte.test.ts`
Expected: FAIL — `e.tool`, `e.setTool`, `e.activeDrawKind`, and `SELECT_TOOL` are undefined.

- [ ] **Step 3: Add the Tool types to `constants.ts`**

Add to `src/routes/editor/constants.ts` (after the existing `PendingRaster` block):

```ts
/** What a page click/drag does. `select` edits existing elements only. */
export type DrawKind = 'text' | 'image' | 'signature' | 'line' | 'rectangle' | 'ellipse';
export type Tool = { type: 'select' } | { type: 'draw'; kind: DrawKind };

/** The idle tool: clicks select/deselect, never create. */
export const SELECT_TOOL: Tool = { type: 'select' };
```

- [ ] **Step 4: Replace `shapeTool` with the unified `tool` in `editor.svelte.ts`**

In `src/routes/editor/editor.svelte.ts`:

1. Update the import from `./constants` to add `SELECT_TOOL` and the `Tool`/`DrawKind` types:

```ts
import {
	DEFAULT_PAGE,
	SCALE,
	MAX_PDF_BYTES,
	MAX_IMAGE_BYTES,
	SIGNATURE_DEFAULT_WIDTH,
	IMAGE_DEFAULT_WIDTH,
	SHAPE_DEFAULT_STROKE,
	SHAPE_DEFAULT_STROKE_WIDTH,
	SHAPE_MIN_SIZE,
	SELECT_TOOL,
	type Tool,
	type DrawKind,
	type PageInfo,
	type PendingRaster
} from './constants';
```

2. Remove the `shapeTool` field and its comment:

```ts
	/** When set, dragging on a page draws a shape of this kind instead of
	 * click-to-add-text. Cleared after one shape is drawn. */
	shapeTool = $state<ShapeKind | null>(null);
```

and replace with:

```ts
	/** Active tool. `select` (default) edits existing elements; a `draw` tool
	 * makes the next page click/drag create that element, then resets to select. */
	tool = $state<Tool>(SELECT_TOOL);
	/** The draw kind in effect, or null when selecting. */
	activeDrawKind = $derived<DrawKind | null>(this.tool.type === 'draw' ? this.tool.kind : null);
```

3. Remove the `setShapeTool` method:

```ts
	/** Toggle the active shape tool (null = back to text/click mode). */
	setShapeTool(kind: ShapeKind | null) {
		this.shapeTool = this.shapeTool === kind ? null : kind;
		if (this.shapeTool) this.selectedId = null;
	}
```

and replace with:

```ts
	/** Activate a tool. Entering a draw tool clears the current selection. */
	setTool(tool: Tool) {
		this.tool = tool;
		if (tool.type === 'draw') this.selectedId = null;
	}

	/** Return to the idle select tool. */
	resetTool() {
		this.tool = SELECT_TOOL;
	}
```

4. Replace `placeAtClient` so it only creates for the active draw tool and is one-shot:

```ts
	/** Handle a click on the bare page background at canvas px coords. Only the
	 * active draw tool creates; shape kinds are drawn by drag, not click. */
	placeAtClient(clientX: number, clientY: number, pageEl: HTMLElement, pageIndex: number) {
		if (this.tool.type !== 'draw') return;
		const kind = this.tool.kind;
		if (kind === 'line' || kind === 'rectangle' || kind === 'ellipse') return;

		const rect = pageEl.getBoundingClientRect();
		const x = (clientX - rect.left) / SCALE;
		const y = (clientY - rect.top) / SCALE;

		if (kind === 'signature') {
			if (!this.pendingSignature) return;
			this.placeSignatureAt(x, y, pageIndex);
		} else if (kind === 'image') {
			if (!this.pendingImage) return;
			this.placeImageAt(x, y, pageIndex);
		} else {
			this.addTextAt(x, y, pageIndex);
		}
		this.resetTool();
	}
```

5. In `beginShapeDraw`, replace the first lines:

```ts
		const kind = this.shapeTool;
		if (!kind) return false;
```

with:

```ts
		const kind =
			this.tool.type === 'draw' &&
			(this.tool.kind === 'line' || this.tool.kind === 'rectangle' || this.tool.kind === 'ellipse')
				? this.tool.kind
				: null;
		if (!kind) return false;
```

6. In `beginShapeDraw`'s `up()` handler, replace:

```ts
			// One-shot tool: return to normal mode after drawing.
			this.shapeTool = null;
```

with:

```ts
			// One-shot tool: return to select after drawing.
			this.resetTool();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx vitest run --project client src/routes/editor/editor.svelte.test.ts`
Expected: PASS (all tool-model tests).

- [ ] **Step 6: Type-check (Canvas/Toolbar still reference `shapeTool` — fixed in Task 3)**

Run: `bun run check`
Expected: errors ONLY in `Canvas.svelte` / `Toolbar.svelte` about `shapeTool`/`setShapeTool`. (These are fixed in Task 3; do not fix anything else.)

- [ ] **Step 7: Commit**

```bash
git add src/routes/editor/constants.ts src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git commit -m "feat(editor): unified Select-default tool model gating element creation"
```

---

## Task 3: Wire Canvas + Toolbar to the tool model

**Files:**
- Modify: `src/routes/editor/Canvas.svelte`
- Modify: `src/routes/editor/Toolbar.svelte` (header redesign + tool buttons)
- Test: `src/routes/editor/Toolbar.svelte.test.ts`

**Interfaces:**
- Consumes: `editor.tool`, `editor.activeDrawKind`, `editor.setTool`, `editor.resetTool`, `editor.select`, `editor.placeAtClient`, `editor.beginShapeDraw`.

- [ ] **Step 1: Update `Canvas.svelte` click/pointerdown handlers**

Replace the `<script>` handlers in `src/routes/editor/Canvas.svelte`:

```svelte
	function onPageClick(event: MouseEvent, pageIndex: number) {
		// Only act on the bare page, not an existing element overlay.
		if (event.target !== event.currentTarget) return;
		if (editor.tool.type === 'select') {
			editor.select(null);
			return;
		}
		// Shape kinds were drawn on pointerdown→up; placeAtClient ignores them.
		editor.placeAtClient(event.clientX, event.clientY, event.currentTarget as HTMLElement, pageIndex);
	}

	function onPagePointerDown(event: PointerEvent, pageIndex: number) {
		if (event.target !== event.currentTarget) return;
		editor.beginShapeDraw(event, event.currentTarget as HTMLElement, pageIndex);
	}
```

(The markup block below is unchanged.)

- [ ] **Step 2: Write a failing Toolbar component test**

Create `src/routes/editor/Toolbar.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));

import Toolbar from './Toolbar.svelte';
import { EditorState } from './editor.svelte';

describe('Toolbar', () => {
	it('activates the Text tool when its button is clicked', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {} } });

		await user.click(screen.getByRole('button', { name: 'Text' }));
		flushSync();
		expect(editor.activeDrawKind).toBe('text');
	});

	it('activates the Rect shape tool', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {} } });

		await user.click(screen.getByRole('button', { name: 'Rectangle' }));
		flushSync();
		expect(editor.activeDrawKind).toBe('rectangle');
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run --project client src/routes/editor/Toolbar.svelte.test.ts`
Expected: FAIL — buttons "Text"/"Rectangle" not found (current Toolbar has no such buttons / still uses `shapeTool`).

- [ ] **Step 4: Rewrite `Toolbar.svelte` (three-zone header, tool groups, no per-selection controls)**

Replace the entire contents of `src/routes/editor/Toolbar.svelte`:

```svelte
<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { DrawKind } from './constants';

	let { editor, onDrawSignature }: { editor: EditorState; onDrawSignature: () => void } = $props();

	async function onPdfChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.loadPdf(file);
		input.value = '';
	}

	async function onImageUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const pending = await editor.readRaster(file);
			if (pending) {
				editor.pendingImage = pending;
				editor.setTool({ type: 'draw', kind: 'image' });
			}
		}
		input.value = '';
	}

	async function onSignatureUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const pending = await editor.readRaster(file);
			if (pending) {
				editor.pendingSignature = pending;
				editor.setTool({ type: 'draw', kind: 'signature' });
			}
		}
		input.value = '';
	}

	const drawTools: { kind: DrawKind; label: string }[] = [
		{ kind: 'text', label: 'Text' },
		{ kind: 'line', label: 'Line' },
		{ kind: 'rectangle', label: 'Rectangle' },
		{ kind: 'ellipse', label: 'Ellipse' }
	];

	function toolClass(active: boolean): string {
		return active
			? 'rounded bg-blue-600 px-2.5 py-1.5 text-sm font-medium text-white'
			: 'rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100';
	}
</script>

<header class="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-2">
	<!-- Left: File -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-semibold text-gray-900">better-pdf</span>
		<label
			class="cursor-pointer rounded bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
		>
			{editor.loadingPdf ? 'Loading…' : 'Upload PDF'}
			<input
				type="file"
				accept="application/pdf,.pdf"
				class="hidden"
				disabled={editor.loadingPdf}
				onchange={onPdfChange}
			/>
		</label>
		{#if editor.sourceBytes}
			<button
				onclick={() => editor.clearSource()}
				class="rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
			>
				New blank
			</button>
		{/if}
	</div>

	<!-- Center: Insert tools — Drawings | Form fields (fields land in PR2) -->
	<div class="mx-auto flex items-center gap-3">
		<div class="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
			<button class={toolClass(editor.tool.type === 'select')} onclick={() => editor.resetTool()}>
				Select
			</button>
			{#each drawTools as t (t.kind)}
				<button
					class={toolClass(editor.activeDrawKind === t.kind)}
					onclick={() => editor.setTool({ type: 'draw', kind: t.kind })}
				>
					{t.label}
				</button>
			{/each}
			<button
				class={toolClass(editor.activeDrawKind === 'signature')}
				onclick={onDrawSignature}
			>
				Signature
			</button>
			<label class={toolClass(editor.activeDrawKind === 'image') + ' cursor-pointer'}>
				Image
				<input
					type="file"
					accept="image/png,image/jpeg,.png,.jpg,.jpeg"
					class="hidden"
					onchange={onImageUpload}
				/>
			</label>
			<label class="cursor-pointer rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
				Upload sig
				<input
					type="file"
					accept="image/png,image/jpeg,.png,.jpg,.jpeg"
					class="hidden"
					onchange={onSignatureUpload}
				/>
			</label>
		</div>
	</div>

	<!-- Right: Export -->
	<button
		onclick={() => editor.export()}
		disabled={editor.exporting}
		class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
	>
		{editor.exporting ? 'Exporting…' : 'Export PDF'}
	</button>
</header>
```

- [ ] **Step 5: Run the Toolbar test to verify it passes**

Run: `bunx vitest run --project client src/routes/editor/Toolbar.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check + lint**

Run: `bun run check && bun run lint`
Expected: 0 errors. (Per-selection controls — text size, shape stroke/fill, delete — moved to the floating toolbar in Task 5; `editor.export()` etc. still resolve.)

- [ ] **Step 7: Commit**

```bash
git add src/routes/editor/Canvas.svelte src/routes/editor/Toolbar.svelte src/routes/editor/Toolbar.svelte.test.ts
git commit -m "feat(editor): redesigned header with separated drawing/field tool groups"
```

---

## Task 4: Rich static text — model, renderer, validation

**Files:**
- Modify: `src/lib/pdf/types.ts`
- Modify: `src/lib/pdf/renderers/text.ts`
- Modify: `src/routes/editor/export.remote.ts`
- Modify: `src/routes/editor/overlays/TextOverlay.svelte`
- Test: `src/lib/pdf/build.text-rich.test.ts`, `src/routes/editor/export-validate.test.ts`

**Interfaces:**
- Consumes: existing `buildPdf`, `renderText`, `validateElement`.
- Produces: `TextElement` gains optional `font`, `color`, `opacity`, `rotation`, `lineHeight`, `maxWidth`; `type StandardFontName`. `validateElement` accepts these.

- [ ] **Step 1: Write failing build test for rich text**

Create `src/lib/pdf/build.text-rich.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState } from './types';

describe('buildPdf rich text', () => {
	it('renders a styled text element to a valid one-page PDF', async () => {
		const state: EditState = {
			pageSize: [300, 400],
			elements: [
				{
					type: 'text',
					id: 't0',
					text: 'Styled',
					x: 20,
					y: 30,
					size: 18,
					page: 0,
					font: 'Times-BoldItalic',
					color: { r: 0.2, g: 0.4, b: 0.6 },
					opacity: 0.5,
					rotation: 15,
					lineHeight: 22,
					maxWidth: 200
				}
			]
		};
		const bytes = await buildPdf(state);
		expect(bytes.byteLength).toBeGreaterThan(0);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getPageCount()).toBe(1);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project server src/lib/pdf/build.text-rich.test.ts`
Expected: FAIL — TS/compile error: `font`/`opacity`/etc. not on `TextElement`.

- [ ] **Step 3: Extend `TextElement` in `types.ts`**

In `src/lib/pdf/types.ts`, add the font-name type above `TextElement` and extend the interface. After the existing `color?` line in `TextElement`, add the rich properties:

```ts
/** The 12 standard PDF fonts better-pdf exposes without embedding. */
export type StandardFontName =
	| 'Helvetica'
	| 'Helvetica-Bold'
	| 'Helvetica-Oblique'
	| 'Helvetica-BoldOblique'
	| 'Courier'
	| 'Courier-Bold'
	| 'Courier-Oblique'
	| 'Courier-BoldOblique'
	| 'Times-Roman'
	| 'Times-Bold'
	| 'Times-Italic'
	| 'Times-BoldItalic';
```

In the `TextElement` interface, after `color?: { r: number; g: number; b: number };` add:

```ts
	/** One of the 12 standard fonts. Defaults to Helvetica. */
	font?: StandardFontName;
	/** Opacity 0..1. Defaults to 1. */
	opacity?: number;
	/** Clockwise rotation in degrees for display; counter-clockwise at draw. */
	rotation?: number;
	/** Baseline distance for multi-line text. Defaults to 1.15 * size. */
	lineHeight?: number;
	/** Word-wrap width in PDF points. Omit for no wrap. */
	maxWidth?: number;
```

- [ ] **Step 4: Pass rich properties in `renderers/text.ts`**

Replace `src/lib/pdf/renderers/text.ts`:

```ts
import { rgb, StandardFonts } from '@ignaciano3/better-pdf/generate';
import type { StandardFontName, TextElement } from '../types';
import type { ElementRenderer } from './types';

/** Map our stored font name to the lib's StandardFonts enum value. */
function toFont(name: StandardFontName | undefined): StandardFonts | undefined {
	return name ? (name as StandardFonts) : undefined;
}

/**
 * Draw a text element. `y` is the element's top edge in top-left coordinates,
 * so the baseline sits one font-size below it after the Y flip. `rotation` is
 * stored clockwise (CSS convention); drawText rotates counter-clockwise.
 */
export const renderText: ElementRenderer<TextElement> = ({ page, pageHeight }, element) => {
	const baselineY = pageHeight - element.y - element.size;
	const { color, font, opacity, rotation, lineHeight, maxWidth } = element;
	const f = toFont(font);
	page.drawText(element.text, {
		x: element.x,
		y: baselineY,
		size: element.size,
		...(color ? { color: rgb(color.r, color.g, color.b) } : {}),
		...(f ? { font: f } : {}),
		...(opacity !== undefined ? { opacity } : {}),
		...(rotation !== undefined ? { rotate: -rotation } : {}),
		...(lineHeight !== undefined ? { lineHeight } : {}),
		...(maxWidth !== undefined ? { maxWidth } : {})
	});
};
```

- [ ] **Step 5: Run the build test to verify it passes**

Run: `bunx vitest run --project server src/lib/pdf/build.text-rich.test.ts`
Expected: PASS.

- [ ] **Step 6: Write a failing validation test**

Create `src/routes/editor/export-validate.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

// The remote module needs the SvelteKit server runtime; we only test the pure
// validator, so stub the bits it imports at module load.
vi.mock('$app/server', () => ({
	command: (_mode: string, fn: unknown) => fn,
	getRequestEvent: () => ({})
}));

import { validateExportInput } from './export.remote';

describe('validateExportInput', () => {
	it('accepts a rich text element', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [
					{
						type: 'text',
						id: 't0',
						text: 'hi',
						x: 1,
						y: 2,
						size: 12,
						font: 'Times-Bold',
						opacity: 0.5,
						rotation: 10,
						lineHeight: 14,
						maxWidth: 100
					}
				]
			}
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects a non-finite opacity', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [
					{ type: 'text', id: 't0', text: 'hi', x: 1, y: 2, size: 12, opacity: Infinity }
				]
			}
		};
		expect(() => validateExportInput(input)).toThrow();
	});
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `bunx vitest run --project server src/routes/editor/export-validate.test.ts`
Expected: FAIL — `validateExportInput` is not exported.

- [ ] **Step 8: Export the validator + validate rich text in `export.remote.ts`**

In `src/routes/editor/export.remote.ts`:

1. Rename `validate` to `validateExportInput` and export it:

```ts
export function validateExportInput(input: unknown): ExportInput {
```

(Update its call site in `exportPdf` from `validate(input)` to `validateExportInput(input)`.)

2. In `validateElement`, extend the `case 'text'` block to validate the rich properties:

```ts
		case 'text':
			if (typeof el.text !== 'string') error(422, 'Invalid text element');
			if (el.text.length > MAX_TEXT_LEN) error(422, 'Text element too large');
			if (!isFiniteNumber(el.size)) error(422, 'Invalid text size');
			if (el.opacity !== undefined && !isFiniteNumber(el.opacity)) error(422, 'Invalid opacity');
			if (el.rotation !== undefined && !isFiniteNumber(el.rotation)) error(422, 'Invalid rotation');
			if (el.lineHeight !== undefined && !isFiniteNumber(el.lineHeight)) {
				error(422, 'Invalid line height');
			}
			if (el.maxWidth !== undefined && !isFiniteNumber(el.maxWidth)) error(422, 'Invalid max width');
			break;
```

- [ ] **Step 9: Run the validation test to verify it passes**

Run: `bunx vitest run --project server src/routes/editor/export-validate.test.ts`
Expected: PASS.

- [ ] **Step 10: Apply rich styling in the text overlay preview**

Replace the styled `<div>` in `src/routes/editor/overlays/TextOverlay.svelte` with one that reflects font/color/opacity/rotation (keep the existing `<script>` plus add the SCALE-based styles):

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute cursor-move whitespace-pre outline-none {editor.selectedId === el.id
		? 'ring-2 ring-blue-400'
		: ''}"
	style="left: {text.x * SCALE}px; top: {text.y * SCALE}px; font-size: {text.size *
		SCALE}px; line-height: {text.lineHeight ? text.lineHeight / text.size : 1}; font-family: {fontCss(
		text.font
	)}; color: {text.color
		? `rgb(${text.color.r * 255} ${text.color.g * 255} ${text.color.b * 255})`
		: 'black'}; opacity: {text.opacity ?? 1}; transform: rotate({text.rotation ?? 0}deg); transform-origin: top left;"
	contenteditable="plaintext-only"
	onpointerdown={(e) => editor.startDrag(e, text)}
	oninput={(e) => (text.text = (e.currentTarget as HTMLElement).innerText)}
>
	{text.text}
</div>
```

Add to the `<script>` (after the `text` derived):

```ts
	function fontCss(font: string | undefined): string {
		if (!font) return 'Helvetica, Arial, sans-serif';
		if (font.startsWith('Times')) return '"Times New Roman", Times, serif';
		if (font.startsWith('Courier')) return '"Courier New", Courier, monospace';
		return 'Helvetica, Arial, sans-serif';
	}
```

- [ ] **Step 11: Full check + tests + lint**

Run: `bun run check && bun run test && bun run lint`
Expected: all PASS / 0 errors.

- [ ] **Step 12: Commit**

```bash
git add src/lib/pdf/types.ts src/lib/pdf/renderers/text.ts src/routes/editor/export.remote.ts src/routes/editor/overlays/TextOverlay.svelte src/lib/pdf/build.text-rich.test.ts src/routes/editor/export-validate.test.ts
git commit -m "feat(editor): rich static text (font/color/opacity/rotation/wrap) end-to-end"
```

---

## Task 5: Floating contextual toolbar

**Files:**
- Create: `src/routes/editor/FloatingToolbar.svelte`
- Modify: `src/routes/editor/+page.svelte` (mount it)
- Modify: `src/routes/editor/editor.svelte.ts` (add `duplicateSelected`)
- Test: `src/routes/editor/editor.svelte.test.ts` (duplicate), `src/routes/editor/FloatingToolbar.svelte.test.ts`

**Interfaces:**
- Consumes: `editor.selected`, `editor.selectedText`, `editor.selectedShape`, `editor.removeSelected`.
- Produces: `editor.duplicateSelected(): void`; a `FloatingToolbar` component that renders contextual controls for the current selection.

- [ ] **Step 1: Write a failing test for `duplicateSelected`**

Append to `src/routes/editor/editor.svelte.test.ts`:

```ts
describe('EditorState duplicateSelected', () => {
	it('clones the selected element with a new id and offset', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'text' });
		e.placeAtClient(40, 80, fakePage(), 0);
		flushSync();
		const original = e.selected!;
		e.duplicateSelected();
		flushSync();
		expect(e.elements.length).toBe(2);
		expect(e.selected!.id).not.toBe(original.id);
		expect(e.selected!.x).toBe(original.x + 8);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project client src/routes/editor/editor.svelte.test.ts`
Expected: FAIL — `duplicateSelected` is not a function.

- [ ] **Step 3: Add `duplicateSelected` to `EditorState`**

In `src/routes/editor/editor.svelte.ts`, after `removeSelected()`:

```ts
	/** Clone the selected element 8pt down-right and select the copy. */
	duplicateSelected() {
		const el = this.selected;
		if (!el) return;
		const clone = {
			...$state.snapshot(el),
			id: this.nextId(el.type[0] ?? 'e'),
			x: el.x + 8,
			y: el.y + 8
		} as EditElement;
		this.add(clone);
	}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run --project client src/routes/editor/editor.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Write a failing FloatingToolbar test**

Create `src/routes/editor/FloatingToolbar.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));

import FloatingToolbar from './FloatingToolbar.svelte';
import { EditorState } from './editor.svelte';

function fakePage(): HTMLElement {
	return {
		getBoundingClientRect: () => ({
			left: 0, top: 0, right: 240, bottom: 320, width: 240, height: 320, x: 0, y: 0, toJSON() {}
		})
	} as unknown as HTMLElement;
}

describe('FloatingToolbar', () => {
	it('shows nothing when there is no selection', () => {
		const editor = new EditorState();
		render(FloatingToolbar, { props: { editor } });
		expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
	});

	it('deletes the selected element', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		editor.setTool({ type: 'draw', kind: 'text' });
		editor.placeAtClient(40, 80, fakePage(), 0);
		flushSync();
		render(FloatingToolbar, { props: { editor } });
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		flushSync();
		expect(editor.elements.length).toBe(0);
	});
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `bunx vitest run --project client src/routes/editor/FloatingToolbar.svelte.test.ts`
Expected: FAIL — module `./FloatingToolbar.svelte` does not exist.

- [ ] **Step 7: Create `FloatingToolbar.svelte`**

Create `src/routes/editor/FloatingToolbar.svelte`:

```svelte
<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE } from './constants';
	import type { StandardFontName } from '$lib/pdf/types';

	let { editor }: { editor: EditorState } = $props();

	const fonts: StandardFontName[] = [
		'Helvetica',
		'Helvetica-Bold',
		'Helvetica-Oblique',
		'Times-Roman',
		'Times-Bold',
		'Times-Italic',
		'Courier',
		'Courier-Bold'
	];

	function toHex(c: { r: number; g: number; b: number } | undefined): string {
		const v = c ?? { r: 0, g: 0, b: 0 };
		const h = (n: number) =>
			Math.round(Math.max(0, Math.min(1, n)) * 255)
				.toString(16)
				.padStart(2, '0');
		return `#${h(v.r)}${h(v.g)}${h(v.b)}`;
	}
	function fromHex(hex: string): { r: number; g: number; b: number } {
		return {
			r: parseInt(hex.slice(1, 3), 16) / 255,
			g: parseInt(hex.slice(3, 5), 16) / 255,
			b: parseInt(hex.slice(5, 7), 16) / 255
		};
	}

	// Anchor just above the selection's top-left, in canvas px.
	const pos = $derived(
		editor.selected
			? { left: editor.selected.x * SCALE, top: editor.selected.y * SCALE - 44 }
			: null
	);
</script>

{#if editor.selected && pos}
	<div
		class="absolute z-20 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg"
		style="left: {pos.left}px; top: {Math.max(pos.top, 0)}px;"
	>
		{#if editor.selectedText}
			{@const t = editor.selectedText}
			<select
				class="rounded border px-1 py-0.5 text-sm"
				value={t.font ?? 'Helvetica'}
				onchange={(e) => (t.font = (e.currentTarget as HTMLSelectElement).value as StandardFontName)}
			>
				{#each fonts as f (f)}
					<option value={f}>{f}</option>
				{/each}
			</select>
			<input
				type="number"
				min="6"
				max="200"
				bind:value={t.size}
				class="w-14 rounded border px-1 py-0.5 text-sm"
				aria-label="Font size"
			/>
			<input
				type="color"
				value={toHex(t.color)}
				oninput={(e) => (t.color = fromHex((e.currentTarget as HTMLInputElement).value))}
				class="h-6 w-6 cursor-pointer rounded border"
				aria-label="Text color"
			/>
		{/if}

		{#if editor.selectedShape}
			{@const sh = editor.selectedShape}
			<input
				type="color"
				value={toHex(sh.strokeColor)}
				oninput={(e) => (sh.strokeColor = fromHex((e.currentTarget as HTMLInputElement).value))}
				class="h-6 w-6 cursor-pointer rounded border"
				aria-label="Stroke color"
			/>
			{#if sh.shape !== 'line'}
				<label class="flex items-center gap-1 text-sm">
					<input
						type="checkbox"
						checked={Boolean(sh.fillColor)}
						onchange={(e) => {
							if ((e.currentTarget as HTMLInputElement).checked) {
								sh.fillColor = { r: 0.8, g: 0.8, b: 0.8 };
							} else {
								delete sh.fillColor;
							}
						}}
					/>
					Fill
				</label>
				{#if sh.fillColor}
					<input
						type="color"
						value={toHex(sh.fillColor)}
						oninput={(e) => (sh.fillColor = fromHex((e.currentTarget as HTMLInputElement).value))}
						class="h-6 w-6 cursor-pointer rounded border"
						aria-label="Fill color"
					/>
				{/if}
			{/if}
		{/if}

		<button
			onclick={() => editor.duplicateSelected()}
			class="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
		>
			Duplicate
		</button>
		<button
			onclick={() => editor.removeSelected()}
			class="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50"
		>
			Delete
		</button>
	</div>
{/if}
```

- [ ] **Step 8: Mount the floating toolbar in the editor page**

In `src/routes/editor/+page.svelte`, import and render it inside the page-relative container. Add the import:

```svelte
	import FloatingToolbar from './FloatingToolbar.svelte';
```

The toolbar is absolutely positioned in canvas coordinates, so it must live inside the scrolling canvas. Simplest correct placement for PR1: render it at the editor root and let it overlay; wrap the `<Canvas>` area. Replace the `<div class="flex min-h-0 flex-1">` block with:

```svelte
	<div class="relative flex min-h-0 flex-1">
		<PageManager {editor} />
		<Canvas {editor} />
		<FloatingToolbar {editor} />
	</div>
```

- [ ] **Step 9: Run the FloatingToolbar test to verify it passes**

Run: `bunx vitest run --project client src/routes/editor/FloatingToolbar.svelte.test.ts`
Expected: PASS.

- [ ] **Step 10: Full check + tests + lint**

Run: `bun run check && bun run test && bun run lint`
Expected: all PASS / 0 errors.

- [ ] **Step 11: Commit**

```bash
git add src/routes/editor/FloatingToolbar.svelte src/routes/editor/FloatingToolbar.svelte.test.ts src/routes/editor/+page.svelte src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git commit -m "feat(editor): Sejda-style floating contextual toolbar for the selection"
```

---

## Task 6: Home landing + editor empty-state

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/editor/+page.svelte`
- Test: manual (visual) — no unit assertions for static marketing markup.

**Interfaces:**
- Consumes: `resolve` from `$app/paths` (lint rule `svelte/no-navigation-without-resolve`).

- [ ] **Step 1: Write the home landing**

Replace `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<main class="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-24 text-center">
	<h1 class="text-4xl font-bold text-gray-900">Edit & create PDFs in your browser</h1>
	<p class="max-w-xl text-lg text-gray-600">
		Fill forms, add text and images, draw and sign — then export. Free up to 2 exports per hour, no
		account needed.
	</p>
	<div class="flex flex-wrap items-center justify-center gap-4">
		<a
			href={resolve('/editor')}
			class="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700"
		>
			Create new PDF
		</a>
		<a
			href={`${resolve('/editor')}?upload=1`}
			class="rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-800 hover:bg-gray-50"
		>
			Edit existing PDF
		</a>
	</div>
	<a href={resolve('/health')} class="text-sm text-gray-400 hover:text-gray-600">health check</a>
</main>
```

- [ ] **Step 2: Add the editor empty-state**

In `src/routes/editor/+page.svelte`, replace the `<Canvas {editor} />` usage area so that when there is no loaded document AND no blank work started, a centered prompt is shown. Add to the `<script>`:

```svelte
	import { page as appPage } from '$app/state';

	let started = $state(false);
	const showEmptyState = $derived(!editor.sourceBytes && !started && editor.elements.length === 0);

	// Deep-link from the home "Edit existing PDF" button.
	$effect(() => {
		if (appPage.url.searchParams.get('upload') === '1') started = false;
	});

	function startBlank() {
		started = true;
	}
	async function onEmptyUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.loadPdf(file);
		input.value = '';
		started = true;
	}
```

Then wrap the canvas region:

```svelte
	<div class="relative flex min-h-0 flex-1">
		<PageManager {editor} />
		{#if showEmptyState}
			<div class="flex flex-1 items-center justify-center">
				<div class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white px-12 py-16">
					<p class="text-lg font-medium text-gray-700">Upload a PDF or start blank</p>
					<div class="flex gap-3">
						<label class="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
							Upload PDF
							<input type="file" accept="application/pdf,.pdf" class="hidden" onchange={onEmptyUpload} />
						</label>
						<button onclick={startBlank} class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">
							Start blank
						</button>
					</div>
				</div>
			</div>
		{:else}
			<Canvas {editor} />
		{/if}
		<FloatingToolbar {editor} />
	</div>
```

- [ ] **Step 3: Type-check + lint**

Run: `bun run check && bun run lint`
Expected: 0 errors.

- [ ] **Step 4: Manual visual verification**

Run: `bun run dev` and open `/`. Confirm: home shows two CTAs; "Create new PDF" → `/editor` empty-state; "Start blank" reveals the canvas; "Upload PDF" loads a document and hides the empty-state.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/editor/+page.svelte
git commit -m "feat: home landing (Create/Edit) and editor upload-or-blank empty-state"
```

---

## Task 7: Full regression pass + smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the whole unit suite**

Run: `bun run test`
Expected: all server + client tests PASS, including the multi-page image-placement regression and the shape/tool tests.

- [ ] **Step 2: Type-check + lint + build**

Run: `bun run check && bun run lint && bun run build`
Expected: 0 errors; build succeeds.

- [ ] **Step 3: Manual smoke (the two original bugs)**

Run: `bun run dev`. With a multi-page PDF: select **Image**, choose a file, click **page 2** → image lands on page 2. Select **Rectangle**, drag on a page → exactly one rectangle, no stray text element. Select tool → clicking bare page deselects, never creates.

- [ ] **Step 4: Commit (if any incidental fixes were needed)**

```bash
git commit -am "test: PR1 regression pass green" --allow-empty
```

---

## Self-Review

- **Spec coverage (PR1 rows):** home landing (Task 6), header redesign + separated tool groups (Task 3), tool model gating clicks (Task 2), floating contextual toolbar (Task 5), rich static text (Task 4), image-on-page-2 regression (Task 2 test + Task 7 smoke), shape/click collision (eliminated by Task 2 gating; covered by Task 2/Task 7). Tests unit-first (Tasks 1–5). ✓
- **Placeholder scan:** every code step shows full code; no TBD/“add validation” placeholders. ✓
- **Type consistency:** `Tool`/`DrawKind`/`SELECT_TOOL` defined in Task 2 and consumed in Tasks 3/5; `StandardFontName` defined in Task 4 and consumed in Task 5; `duplicateSelected`/`activeDrawKind`/`setTool`/`resetTool` names match across tasks; `validateExportInput` rename applied at its call site. ✓
- **Deferred to later PRs (not gaps):** field tools/types, vector/links/custom-font, zoom/page-size/merge/metadata/outline — PR2–PR4.
