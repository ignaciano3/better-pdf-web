# Zoom Re-rasterise Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-rasterise visible source pages to a live `<canvas>` when the editor zoom settles, so pages stay native-viewer crisp at any zoom up to `ZOOM_MAX = 4`.

**Architecture:** Keep the cheap PNG data-URLs (now lower-oversample) as instant placeholders and thumbnails. Add a per-`docIndex` cache of live pdf.js `PDFDocumentProxy` documents (`PdfDocStore`), opened lazily from the already-stored `sources[docIndex]` bytes. A new `PdfPageCanvas` component renders the sharp raster over the PNG placeholder, sized at `SCALE * zoom * devicePixelRatio`, debounced on zoom-settle, visible-only via `IntersectionObserver`, with render cancellation and out-of-order guards. Pointer math, overlays, exports, and thumbnails are untouched.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, pdf.js (`pdfjs-dist` ^6), Vitest (jsdom client project), Playwright e2e, Tailwind.

## Global Constraints

- pdf.js is browser-only; it must never load during SSR. Always reach it through `loadPdfjs()` in `src/lib/pdf/render.ts` (lazy dynamic import) — never `import 'pdfjs-dist'` at module top level.
- pdf.js detaches the `data` buffer it opens. Always open from a copy: `getDocument({ data: bytes.slice() })`.
- Element coordinates are PDF points; on-screen px = `coord * SCALE` where `SCALE = 0.8`. `cssScale = SCALE * zoom`. **Do not change any of this.** The new canvas only grows its backing store; its CSS display box stays `contentBox * SCALE`.
- Display box and rotation of the sharp canvas must exactly match the existing `<img>` placeholder: width `box.width * SCALE`, height `box.height * SCALE`, `transform: translate(-50%, -50%) rotate({rot}deg)`, `pointer-events-none`.
- Zoom bounds: `ZOOM_MIN = 0.25`, `ZOOM_MAX = 4`, `ZOOM_STEP = 0.25` (from `constants.ts`).
- Export path is out of scope and must not change — export rebuilds from `sources` bytes server-side.
- Tests: client component/state tests are `*.svelte.test.ts` (jsdom, `globals: true`, run by the `client` vitest project). Run a single file with `npx vitest run <path>`. e2e: `npm run test:e2e`.
- Existing tests must keep passing: `npm test`.

---

## File Structure

- **Create** `src/lib/pdf/pdf-doc-store.ts` — `PdfDocStore` class: lazy per-`docIndex` cache of `PDFDocumentProxy`, opened from bytes; `get`, `destroy`, `destroyAll`.
- **Create** `src/lib/pdf/pdf-doc-store.test.ts` — server-project unit test for the store (cache reuse + destroy), pdf.js mocked.
- **Modify** `src/lib/pdf/render.ts` — export `loadPdfjs`; lower the placeholder/thumbnail oversample to `[1.5, 2]` (it is no longer the on-screen sharpness source).
- **Modify** `src/routes/editor/editor.svelte.ts` — own a `PdfDocStore`; add `getPdfDoc(docIndex)` and `dispose()`; destroy cached docs in `clearSource()`, at the start of `loadPdf()`, and on teardown.
- **Create** `src/routes/editor/PdfPageCanvas.svelte` — the live sharp-raster layer (placeholder `<img>` behind + `<canvas>` on top).
- **Create** `src/routes/editor/PdfPageCanvas.svelte.test.ts` — client component test: requests viewport scale `SCALE*zoom*dpr`, re-renders on zoom change (pdf.js mocked).
- **Modify** `src/routes/editor/Canvas.svelte` — replace the source-page `<img>` block with `<PdfPageCanvas …>`.
- **Modify** `src/routes/editor/+page.svelte` — call `editor.dispose()` in `onDestroy`.
- **Create** `e2e/zoom-rerender.spec.ts` — Playwright: zoom to 400%, assert the page canvas backing store grows, no blank flash.

---

## Task 1: `PdfDocStore` — cache live pdf.js documents

**Files:**
- Create: `src/lib/pdf/pdf-doc-store.ts`
- Modify: `src/lib/pdf/render.ts` (export `loadPdfjs`)
- Test: `src/lib/pdf/pdf-doc-store.test.ts`

**Interfaces:**
- Consumes: `loadPdfjs(): Promise<typeof import('pdfjs-dist')>` from `render.ts` (newly exported).
- Produces:
  - `loadPdfjs` is now `export`ed from `render.ts`.
  - `class PdfDocStore { get(docIndex: number, bytes: Uint8Array): Promise<import('pdfjs-dist').PDFDocumentProxy>; destroy(docIndex: number): Promise<void>; destroyAll(): Promise<void>; }`
  - `get` caches by `docIndex`: a second call with the same `docIndex` returns the same proxy promise without re-opening. `destroy`/`destroyAll` evict the cache and call `.destroy()` on each proxy.

- [ ] **Step 1: Export `loadPdfjs` from `render.ts`**

In `src/lib/pdf/render.ts`, change the declaration on line 7 from:

```ts
async function loadPdfjs(): Promise<PdfJs> {
```

to:

```ts
export async function loadPdfjs(): Promise<PdfJs> {
```

(Leave the body unchanged.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/pdf/pdf-doc-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// One fake proxy per opened document; getDocument counts how often it's called.
const destroyed: number[] = [];
let openCount = 0;

function makeProxy(id: number) {
	return {
		id,
		destroy: vi.fn(async () => {
			destroyed.push(id);
		})
	};
}

vi.mock('./render', () => ({
	loadPdfjs: vi.fn(async () => ({
		getDocument: () => {
			const proxy = makeProxy(++openCount);
			return { promise: Promise.resolve(proxy) };
		}
	}))
}));

import { PdfDocStore } from './pdf-doc-store';

beforeEach(() => {
	destroyed.length = 0;
	openCount = 0;
});

describe('PdfDocStore', () => {
	it('opens a document once per docIndex and reuses it', async () => {
		const store = new PdfDocStore();
		const bytes = new Uint8Array([1, 2, 3]);
		const a = await store.get(0, bytes);
		const b = await store.get(0, bytes);
		expect(a).toBe(b);
		expect(openCount).toBe(1);
	});

	it('opens distinct documents for distinct docIndexes', async () => {
		const store = new PdfDocStore();
		await store.get(0, new Uint8Array([1]));
		await store.get(1, new Uint8Array([2]));
		expect(openCount).toBe(2);
	});

	it('destroy evicts and destroys one document; re-get re-opens', async () => {
		const store = new PdfDocStore();
		const first = await store.get(0, new Uint8Array([1]));
		await store.destroy(0);
		expect(destroyed).toContain((first as { id: number }).id);
		await store.get(0, new Uint8Array([1]));
		expect(openCount).toBe(2);
	});

	it('destroyAll destroys every cached document and clears the cache', async () => {
		const store = new PdfDocStore();
		await store.get(0, new Uint8Array([1]));
		await store.get(1, new Uint8Array([2]));
		await store.destroyAll();
		expect(destroyed.length).toBe(2);
		await store.get(0, new Uint8Array([1]));
		expect(openCount).toBe(3);
	});

	it('opens from a copy so the caller buffer is never detached', async () => {
		const store = new PdfDocStore();
		const bytes = new Uint8Array([5, 6, 7]);
		await store.get(0, bytes);
		// The caller's bytes are still readable (a real detach would zero length).
		expect(bytes.length).toBe(3);
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/pdf/pdf-doc-store.test.ts`
Expected: FAIL — `Cannot find module './pdf-doc-store'` (file not created yet).

- [ ] **Step 4: Implement `PdfDocStore`**

Create `src/lib/pdf/pdf-doc-store.ts`:

```ts
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from './render';

/**
 * Lazily opens and caches one live pdf.js {@link PDFDocumentProxy} per source
 * document index, so the editor can re-rasterise pages on zoom instead of
 * scaling a frozen PNG. Documents are opened from a COPY of the bytes (pdf.js
 * detaches the buffer it reads) and must be destroyed via {@link destroy} /
 * {@link destroyAll} to free pdf.js worker memory.
 */
export class PdfDocStore {
	// Cache the promise (not the resolved proxy) so concurrent callers for the
	// same docIndex share a single open instead of racing two `getDocument`s.
	#docs = new Map<number, Promise<PDFDocumentProxy>>();

	/** The live proxy for `docIndex`, opening it from `bytes` on first request. */
	get(docIndex: number, bytes: Uint8Array): Promise<PDFDocumentProxy> {
		let existing = this.#docs.get(docIndex);
		if (!existing) {
			existing = (async () => {
				const { getDocument } = await loadPdfjs();
				// pdf.js may detach the buffer; open from a copy.
				return getDocument({ data: bytes.slice() }).promise;
			})();
			this.#docs.set(docIndex, existing);
		}
		return existing;
	}

	/** Evict and destroy the document for one `docIndex` (no-op if absent). */
	async destroy(docIndex: number): Promise<void> {
		const p = this.#docs.get(docIndex);
		this.#docs.delete(docIndex);
		if (!p) return;
		try {
			(await p).destroy();
		} catch {
			// A document that failed to open has nothing to free.
		}
	}

	/** Evict and destroy every cached document. */
	async destroyAll(): Promise<void> {
		const all = [...this.#docs.values()];
		this.#docs.clear();
		for (const p of all) {
			try {
				(await p).destroy();
			} catch {
				// ignore per-doc teardown failures
			}
		}
	}
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/pdf/pdf-doc-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/pdf-doc-store.ts src/lib/pdf/pdf-doc-store.test.ts src/lib/pdf/render.ts
git commit -m "feat(pdf): add PdfDocStore caching live pdf.js documents per source"
```

---

## Task 2: Lower the placeholder/thumbnail oversample

**Files:**
- Modify: `src/lib/pdf/render.ts:39-44` (`renderOversample`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderSourcePdf` output PNGs are now ~1.5–2× device pixels (placeholder/thumbnail only). The public signature of `renderSourcePdf` is unchanged.

**Why:** The PNG is now only an instant placeholder + thumbnail; on-screen sharpness comes from `PdfPageCanvas`. Dropping the oversample shrinks data-URL/memory cost.

- [ ] **Step 1: Edit the oversample bounds**

In `src/lib/pdf/render.ts`, replace the body of `renderOversample` (lines 39–44):

```ts
function renderOversample(): number {
	const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
	// 2× headroom over the device ratio keeps it sharp a bit past the fit zoom;
	// clamp to [2, 4] to bound the largest raster.
	return Math.min(4, Math.max(2, Math.round(dpr * 2)));
}
```

with:

```ts
function renderOversample(): number {
	const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
	// The PNG is now only the placeholder/thumbnail; PdfPageCanvas owns on-screen
	// sharpness by re-rasterising on zoom. Keep just enough resolution to look
	// crisp at fit/normal zoom, clamped to [1.5, 2] to keep data-URLs small.
	return Math.min(2, Math.max(1.5, dpr));
}
```

- [ ] **Step 2: Verify existing render-related tests still pass**

Run: `npm test`
Expected: PASS — no test asserts on the exact oversample value; the build/export suite is unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/render.ts
git commit -m "perf(pdf): lower PNG oversample now that it is placeholder-only"
```

---

## Task 3: Wire `PdfDocStore` lifecycle into `EditorState`

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts`
- Test: `src/routes/editor/editor.svelte.test.ts` (add cases) — verify existing test file path first.

**Interfaces:**
- Consumes: `PdfDocStore` from `$lib/pdf/pdf-doc-store`; `PDFDocumentProxy` type from `pdfjs-dist`.
- Produces on `EditorState`:
  - `getPdfDoc(docIndex: number): Promise<PDFDocumentProxy>` — resolves the live doc for `docIndex` from `this.sources[docIndex]`; rejects if those bytes are absent.
  - `dispose(): void` — destroys all cached documents (called on editor teardown).
  - `clearSource()` additionally destroys all cached documents.
  - `loadPdf()` destroys all cached documents before replacing `sources` (so a re-upload doesn't leak the old doc 0).

- [ ] **Step 1: Write the failing test**

Add to `src/routes/editor/editor.svelte.test.ts` (the file already mocks `./export.remote` and `./extractFields.remote`; reuse those mocks). Append this block inside the file, and add the `PdfDocStore` mock near the top with the other `vi.mock` calls:

```ts
// --- add near the existing vi.mock(...) calls at the top of the file ---
vi.mock('$lib/pdf/pdf-doc-store', () => {
	const getDoc = vi.fn(async () => ({ destroy: vi.fn() }));
	const destroyAll = vi.fn(async () => {});
	return {
		PdfDocStore: vi.fn().mockImplementation(() => ({
			get: getDoc,
			destroy: vi.fn(async () => {}),
			destroyAll
		})),
		// expose the spies for assertions
		__getDoc: getDoc,
		__destroyAll: destroyAll
	};
});
```

```ts
// --- add as a new describe block at the bottom of the file ---
import * as docStoreMod from '$lib/pdf/pdf-doc-store';

describe('EditorState pdf-doc-store wiring', () => {
	it('getPdfDoc rejects when the source bytes are missing', async () => {
		const editor = new EditorState();
		await expect(editor.getPdfDoc(0)).rejects.toThrow();
	});

	it('getPdfDoc asks the store for the doc using the source bytes', async () => {
		const editor = new EditorState();
		const bytes = new Uint8Array([1, 2, 3]);
		editor.sources = [bytes];
		await editor.getPdfDoc(0);
		const getDoc = (docStoreMod as unknown as { __getDoc: ReturnType<typeof vi.fn> }).__getDoc;
		expect(getDoc).toHaveBeenCalledWith(0, bytes);
	});

	it('dispose destroys all cached documents', () => {
		const editor = new EditorState();
		editor.dispose();
		const destroyAll = (docStoreMod as unknown as { __destroyAll: ReturnType<typeof vi.fn> })
			.__destroyAll;
		expect(destroyAll).toHaveBeenCalled();
	});

	it('clearSource destroys all cached documents', () => {
		const editor = new EditorState();
		const destroyAll = (docStoreMod as unknown as { __destroyAll: ReturnType<typeof vi.fn> })
			.__destroyAll;
		destroyAll.mockClear();
		editor.clearSource();
		expect(destroyAll).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/routes/editor/editor.svelte.test.ts`
Expected: FAIL — `editor.getPdfDoc is not a function` / `editor.dispose is not a function`.

- [ ] **Step 3: Add the import and the store field**

In `src/routes/editor/editor.svelte.ts`, add to the imports near line 19 (after the `render` import):

```ts
import { PdfDocStore } from '$lib/pdf/pdf-doc-store';
import type { PDFDocumentProxy } from 'pdfjs-dist';
```

Add the store field to the class. Place it right after the `#rasterUrls` private field (around line 203):

```ts
	/** Live pdf.js documents per source index, for re-rasterising on zoom. Not
	 * reactive — components await {@link getPdfDoc}; the PNG placeholder covers
	 * the gap before the sharp canvas paints. */
	#docStore = new PdfDocStore();
```

- [ ] **Step 4: Add `getPdfDoc` and `dispose`**

In `src/routes/editor/editor.svelte.ts`, add these methods inside the class — put them at the end of the `--- source PDF ---` section, right after `appendPdf` (before the `// --- zoom ---` comment near line 1102):

```ts
	/**
	 * The live pdf.js document for source `docIndex`, opened lazily from its
	 * stored bytes and cached. Used by {@link PdfPageCanvas} to re-rasterise on
	 * zoom. Rejects when no bytes exist for that index (e.g. blank mode).
	 */
	getPdfDoc(docIndex: number): Promise<PDFDocumentProxy> {
		const bytes = this.sources[docIndex];
		if (!bytes) return Promise.reject(new Error(`No source bytes for doc ${docIndex}`));
		return this.#docStore.get(docIndex, bytes);
	}

	/** Destroy every cached pdf.js document. Call on editor teardown. */
	dispose() {
		void this.#docStore.destroyAll();
	}
```

- [ ] **Step 5: Destroy docs in `clearSource` and at the start of `loadPdf`**

In `clearSource()` (around line 1036), add as the first statement:

```ts
	clearSource() {
		void this.#docStore.destroyAll();
		this.sources = [];
```

In `loadPdf()` (around line 1000), add a destroy before replacing the sources. Insert it right after `this.loadingPdf = true;` and the `try {` opening, before `const bytes = ...`:

```ts
		this.loadingPdf = true;
		try {
			// A re-upload replaces source 0; drop any previously cached document so
			// the old proxy is freed and the new bytes are reopened on next render.
			void this.#docStore.destroyAll();
			const bytes = new Uint8Array(await file.arrayBuffer());
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/routes/editor/editor.svelte.test.ts`
Expected: PASS (existing cases + the 4 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git commit -m "feat(editor): own PdfDocStore lifecycle with getPdfDoc + dispose"
```

---

## Task 4: `PdfPageCanvas` — the live sharp-raster layer

**Files:**
- Create: `src/routes/editor/PdfPageCanvas.svelte`
- Test: `src/routes/editor/PdfPageCanvas.svelte.test.ts`

**Interfaces:**
- Consumes:
  - `EditorState.getPdfDoc(docIndex): Promise<PDFDocumentProxy>` (Task 3).
  - `EditorState.zoom: number`, `EditorState.sources: Uint8Array[]`.
  - `RenderedPage` (`{ width; height; dataUrl }`) from `$lib/pdf/render`.
  - `SCALE` from `./constants`.
- Produces: a component with props
  `{ editor: EditorState; docIndex: number; sourceIndex: number; render: RenderedPage; rotation: number; box: { width: number; height: number } }`.
  Renders an absolutely-centred placeholder `<img>` (the PNG) with a `<canvas>` over it; the canvas backing store is sized `ceil(SCALE * zoom * dpr * box.{w,h})` and the display box is `box.{w,h} * SCALE` rotated by `rotation`.

**Behaviour notes for the implementer (encoded in the code below):**
- Debounce re-render ~150ms after `editor.zoom` settles.
- Cancel the in-flight `RenderTask` before starting a new one; a monotonically increasing `seq` guards against out-of-order completion so only the latest scale wins.
- Only render when the canvas is intersecting the viewport (`IntersectionObserver`, 200px rootMargin); off-screen pages render when scrolled in.
- Keep `sharp = false` until a render completes, then fade the placeholder.

- [ ] **Step 1: Write the failing component test**

Create `src/routes/editor/PdfPageCanvas.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

// Capture every viewport scale the component requests.
const requestedScales: number[] = [];

// A fake pdf.js page/doc the editor's getPdfDoc resolves to.
function fakePage() {
	return {
		getViewport: ({ scale }: { scale: number }) => {
			requestedScales.push(scale);
			return { width: 100 * scale, height: 100 * scale };
		},
		render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
		cleanup: vi.fn()
	};
}

import PdfPageCanvas from './PdfPageCanvas.svelte';
import { EditorState } from './editor.svelte';
import type { RenderedPage } from '$lib/pdf/render';

// Force a deterministic device pixel ratio.
Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

// jsdom has no IntersectionObserver: stub it to report "visible" immediately.
class IO {
	cb: IntersectionObserverCallback;
	constructor(cb: IntersectionObserverCallback) {
		this.cb = cb;
	}
	observe(el: Element) {
		this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
	}
	unobserve() {}
	disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IO as never);

const renderInfo: RenderedPage = { width: 100, height: 100, dataUrl: 'data:image/png;base64,AAAA' };

function makeEditor() {
	const editor = new EditorState();
	editor.sources = [new Uint8Array([1, 2, 3])];
	// Resolve getPdfDoc to a fake document.
	vi.spyOn(editor, 'getPdfDoc').mockResolvedValue({
		getPage: vi.fn(async () => fakePage()),
		destroy: vi.fn()
	} as never);
	return editor;
}

beforeEach(() => {
	requestedScales.length = 0;
	vi.useFakeTimers();
});

describe('PdfPageCanvas', () => {
	it('requests viewport scale SCALE*zoom*dpr when visible', async () => {
		const editor = makeEditor();
		editor.zoom = 1;
		render(PdfPageCanvas, {
			props: { editor, docIndex: 0, sourceIndex: 0, render: renderInfo, rotation: 0, box: { width: 100, height: 100 } }
		});
		flushSync();
		await vi.advanceTimersByTimeAsync(200); // past the debounce
		// SCALE (0.8) * zoom (1) * dpr (2) = 1.6
		expect(requestedScales.at(-1)).toBeCloseTo(1.6, 5);
	});

	it('re-renders at a larger scale after zoom increases', async () => {
		const editor = makeEditor();
		editor.zoom = 1;
		render(PdfPageCanvas, {
			props: { editor, docIndex: 0, sourceIndex: 0, render: renderInfo, rotation: 0, box: { width: 100, height: 100 } }
		});
		flushSync();
		await vi.advanceTimersByTimeAsync(200);
		const first = requestedScales.at(-1)!;

		editor.zoom = 4;
		flushSync();
		await vi.advanceTimersByTimeAsync(200);
		const second = requestedScales.at(-1)!;

		expect(second).toBeCloseTo(0.8 * 4 * 2, 5); // 6.4
		expect(second).toBeGreaterThan(first);
	});

	it('renders the PNG placeholder img', () => {
		const editor = makeEditor();
		const { container } = render(PdfPageCanvas, {
			props: { editor, docIndex: 0, sourceIndex: 0, render: renderInfo, rotation: 0, box: { width: 100, height: 100 } }
		});
		const img = container.querySelector('img');
		expect(img?.getAttribute('src')).toBe(renderInfo.dataUrl);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/routes/editor/PdfPageCanvas.svelte.test.ts`
Expected: FAIL — `Failed to resolve import "./PdfPageCanvas.svelte"`.

- [ ] **Step 3: Implement `PdfPageCanvas.svelte`**

Create `src/routes/editor/PdfPageCanvas.svelte`:

```svelte
<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { RenderedPage } from '$lib/pdf/render';
	import { SCALE } from './constants';

	let {
		editor,
		docIndex,
		sourceIndex,
		render,
		rotation,
		box
	}: {
		editor: EditorState;
		docIndex: number;
		sourceIndex: number;
		render: RenderedPage;
		rotation: number;
		box: { width: number; height: number };
	} = $props();

	let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
	// True once a crisp canvas has painted; fades out the PNG placeholder.
	let sharp = $state(false);
	// Set by the IntersectionObserver; off-screen pages don't rasterise.
	let visible = $state(false);

	function dpr(): number {
		return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
	}

	// Latest-wins guard: only the most recently requested render may flip `sharp`
	// and keep its bitmap. An older RenderTask that resolves late is ignored.
	let seq = 0;
	let currentTask: { cancel(): void } | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	async function rerender(targetZoom: number) {
		const canvas = canvasEl;
		if (!canvas || !visible) return;
		if (!editor.sources[docIndex]) return;
		const mine = ++seq;
		// Cancel any in-flight render before starting a new one.
		currentTask?.cancel();
		currentTask = null;

		let page: { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<void>; cancel(): void }; cleanup: () => void } | null = null;
		try {
			const doc = await editor.getPdfDoc(docIndex);
			if (mine !== seq) return;
			page = await doc.getPage(sourceIndex + 1);
			if (mine !== seq) return;

			const scale = SCALE * targetZoom * dpr();
			const viewport = page.getViewport({ scale });
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);

			const task = page.render({ canvas, viewport });
			currentTask = task;
			await task.promise;
			if (mine !== seq) return;
			sharp = true;
		} catch {
			// Cancelled or failed: keep the PNG placeholder visible.
		} finally {
			page?.cleanup();
			if (mine === seq) currentTask = null;
		}
	}

	// Re-rasterise when zoom settles (debounced) or when the page scrolls in.
	$effect(() => {
		const z = editor.zoom;
		if (!visible) return;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => void rerender(z), 150);
		return () => clearTimeout(debounceTimer);
	});

	// Render only what's on screen.
	$effect(() => {
		const el = canvasEl;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) visible = e.isIntersecting;
			},
			{ rootMargin: '200px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	// A new source page (reorder/delete) invalidates the current bitmap.
	$effect(() => {
		// Touch the identifying inputs so the placeholder shows again on change.
		void docIndex;
		void sourceIndex;
		void render.dataUrl;
		sharp = false;
	});

	const displayStyle = $derived(
		`width: ${box.width * SCALE}px; height: ${box.height * SCALE}px; ` +
			`transform: translate(-50%, -50%) rotate(${rotation}deg);`
	);
</script>

<!-- PNG placeholder: instant, soft; sits under the sharp canvas until it paints. -->
<img
	src={render.dataUrl}
	alt={`Page ${sourceIndex + 1}`}
	class="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none transition-opacity duration-150"
	style={`${displayStyle} opacity: ${sharp ? 0 : 1};`}
	draggable="false"
/>
<!-- Sharp re-rasterised layer. Same display box + rotation as the placeholder;
     only its backing store grows with zoom*dpr. -->
<canvas
	bind:this={canvasEl}
	class="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none transition-opacity duration-150"
	style={`${displayStyle} opacity: ${sharp ? 1 : 0};`}
></canvas>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/routes/editor/PdfPageCanvas.svelte.test.ts`
Expected: PASS (3 tests). The requested scales include `1.6` then `6.4`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/PdfPageCanvas.svelte src/routes/editor/PdfPageCanvas.svelte.test.ts
git commit -m "feat(editor): add PdfPageCanvas live re-rasterising layer"
```

---

## Task 5: Wire `PdfPageCanvas` into `Canvas.svelte`

**Files:**
- Modify: `src/routes/editor/Canvas.svelte:113-128` (the source-page `<img>` block)

**Interfaces:**
- Consumes: `PdfPageCanvas` (Task 4); existing `editor.pageRender(i)`, `editor.pageRotation(i)`, `editor.pageContentBox(i)`, and the `pageOps` entry's `docIndex`/`sourceIndex`.
- Produces: source pages now show the sharp canvas; blank pages, overlays, watermark, floating toolbar, and the `+ Add page` button are unchanged.

- [ ] **Step 1: Import `PdfPageCanvas`**

In `src/routes/editor/Canvas.svelte`, add to the imports (after the `FloatingToolbar` import on line 6):

```ts
	import PdfPageCanvas from './PdfPageCanvas.svelte';
```

- [ ] **Step 2: Replace the `<img>` block with `<PdfPageCanvas>`**

Replace lines 113–128 (the `{#if editor.pageRender(pageIndex)}` block containing the `<img>`):

```svelte
				{#if editor.pageRender(pageIndex)}
					{@const render = editor.pageRender(pageIndex)}
					{@const rot = editor.pageRotation(pageIndex)}
					{@const box = editor.pageContentBox(pageIndex)}
					<!-- Scale the source image to the (un-rotated) content box, not its
					     intrinsic size, so a page-size override matches the export, which
					     stretches the embedded page to fill the same box. -->
					<img
						src={render?.dataUrl}
						alt={`Page ${pageIndex + 1}`}
						class="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
						style="width: {box.width * SCALE}px; height: {box.height *
							SCALE}px; transform: translate(-50%, -50%) rotate({rot}deg);"
						draggable="false"
					/>
				{/if}
```

with:

```svelte
				{#if editor.pageRender(pageIndex)}
					{@const render = editor.pageRender(pageIndex)}
					{@const rot = editor.pageRotation(pageIndex)}
					{@const box = editor.pageContentBox(pageIndex)}
					{@const op = editor.pageOps[pageIndex]}
					<!-- Source pages re-rasterise on zoom for native-viewer sharpness;
					     the PNG render is the placeholder. The display box matches the
					     content box (and the export), unaffected by zoom. -->
					{#if op && op.kind === 'source' && render}
						<PdfPageCanvas
							{editor}
							docIndex={op.docIndex ?? 0}
							sourceIndex={op.sourceIndex}
							{render}
							rotation={rot}
							{box}
						/>
					{/if}
				{/if}
```

(`editor.pageRender` already returns `null` for blank pages, so the inner `op.kind === 'source'` guard simply hands `PdfPageCanvas` the exact `docIndex`/`sourceIndex` it needs.)

- [ ] **Step 3: Type-check + lint the editor**

Run: `npm run check`
Expected: PASS — no type errors. (`SCALE` is still imported and used elsewhere in the file for page sizing.)

- [ ] **Step 4: Run the editor unit/component suite**

Run: `npx vitest run src/routes/editor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/Canvas.svelte
git commit -m "feat(editor): render source pages through PdfPageCanvas"
```

---

## Task 6: Dispose pdf.js documents on editor teardown

**Files:**
- Modify: `src/routes/editor/+page.svelte`

**Interfaces:**
- Consumes: `EditorState.dispose()` (Task 3).
- Produces: cached pdf.js documents are destroyed when the editor route unmounts.

- [ ] **Step 1: Import `onDestroy` and wire it**

In `src/routes/editor/+page.svelte`, add `onDestroy` to the script. After the `const editor = new EditorState();` line, add:

```ts
	import { onDestroy } from 'svelte';
	// (place the import with the other top-of-script imports)
```

and after the `const editor = new EditorState();` declaration:

```ts
	// Free pdf.js worker memory (cached source documents) when leaving the editor.
	onDestroy(() => editor.dispose());
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/editor/+page.svelte
git commit -m "fix(editor): dispose cached pdf.js documents on teardown"
```

---

## Task 7: e2e — zoom re-rasterises the source page

**Files:**
- Create: `e2e/zoom-rerender.spec.ts`

**Interfaces:**
- Consumes: the running app at `/editor`; a source PDF to upload (generated in-test so no binary fixture is checked in).

**Note:** There is no PDF fixture in `e2e/` today and the empty-state offers Upload or Start blank. The cheapest real source PDF is one the app itself produces: export a blank page, then re-upload it. The test below does exactly that, so it needs no committed binary.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/zoom-rerender.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

async function gotoEditor(page: Page) {
	await page.addInitScript((fp) => localStorage.setItem('bpw:fingerprint', fp), `e2e-zoom-${randomUUID()}`);
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
}

test('zooming re-rasterises the source page to a larger canvas backing store', async ({ page }) => {
	await gotoEditor(page);

	// 1. Produce a real one-page PDF by exporting a blank page.
	await page.getByRole('button', { name: 'Start blank' }).click();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PDF' }).click();
	const pdfPath = await (await downloadPromise).path();
	const pdfBytes = await readFile(pdfPath);

	// 2. Re-open the editor and upload that PDF so a <PdfPageCanvas> renders.
	await gotoEditor(page);
	await page.setInputFiles('input[type="file"]', {
		name: 'doc.pdf',
		mimeType: 'application/pdf',
		buffer: pdfBytes
	});

	const canvas = page.locator('div.shadow-lg canvas').first();
	await expect(canvas).toBeVisible();

	// 3. At fit zoom, the backing store reflects SCALE*zoom*dpr; capture it.
	const widthAtFit = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
	expect(widthAtFit).toBeGreaterThan(0);

	// 4. Zoom to the max (400%) and let the debounced re-render settle.
	const zoomIn = page.getByRole('button', { name: 'Zoom in' });
	for (let i = 0; i < 12; i++) await zoomIn.click(); // step past ZOOM_MAX; clamps to 4
	await page.waitForTimeout(400);

	// 5. The backing store must have grown (re-rasterised, not just CSS-scaled).
	await expect
		.poll(async () => canvas.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 4000 })
		.toBeGreaterThan(widthAtFit);
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npx playwright test e2e/zoom-rerender.spec.ts`
Expected: PASS — the canvas `width` after zooming to 400% is strictly greater than at fit zoom.

(If the dev/preview server isn't already configured by `playwright.config`, run via `npm run test:e2e -- zoom-rerender.spec.ts` which uses the project's web-server setup.)

- [ ] **Step 3: Commit**

```bash
git add e2e/zoom-rerender.spec.ts
git commit -m "test(e2e): assert source pages re-rasterise on zoom"
```

---

## Task 8: Full verification

- [ ] **Step 1: Lint, type-check, unit, e2e**

Run, expecting PASS on each:

```bash
npm run check
npm test
npm run test:e2e
```

- [ ] **Step 2: Manual smoke (one pass)**

- Upload a multi-page PDF. Pages show instantly (PNG), then sharpen.
- Zoom to 400%: text edges are crisp, no blank flash, no soft scaling.
- Scroll a long doc at high zoom: off-screen pages sharpen as they enter view.
- Reorder/delete/rotate pages: the correct source page stays under each output page.
- Thumbnails in the Pages panel still render (unchanged PNG path).
- Export still downloads a valid PDF.

- [ ] **Step 3: Commit any smoke fixes, then finish the branch**

Use superpowers:finishing-a-development-branch to decide merge/PR.

---

## Self-Review notes (already folded into the tasks)

- **Spec §1 (keep doc alive):** Task 1 (`PdfDocStore` opens from `sources` bytes) + Task 3 (`getPdfDoc`, destroy in `clearSource`/`loadPdf`/`dispose`). `renderSourcePdf` keeps destroying its own loading task — the live doc is a separate cached open, which is simpler and avoids touching the existing render/destroy flow.
- **Spec §2 (PdfPageCanvas):** Task 4 — props, display box unchanged, backing store `SCALE*zoom*dpr`, debounce 150ms, cancel + latest-wins `seq` guard, placeholder fade.
- **Spec §3 (visible-only):** Task 4 — `IntersectionObserver` with 200px rootMargin.
- **Spec §4 (wire into Canvas):** Task 5 — replaces the `<img>` for `source` pages only; blanks/overlays/`+ Add page` untouched.
- **Spec §5 (thumbnails unchanged):** No change to `PageManager.svelte`; oversample lowered in Task 2.
- **Spec §6 (memory/lifecycle):** `page.cleanup()` per render (Task 4 `finally`); destroy on `clearSource`/`loadPdf`/`onDestroy` (Tasks 3, 6).
- **Type consistency:** `getPdfDoc(docIndex)`, `dispose()`, `PdfDocStore.get/destroy/destroyAll`, and the `PdfPageCanvas` prop names (`render`, `rotation`, `box`) are used identically across tasks.
- **Out of scope honoured:** export path and tiled rendering untouched.
```

