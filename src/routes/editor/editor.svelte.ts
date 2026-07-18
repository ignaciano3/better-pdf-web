import type {
	AttachmentInput,
	DocumentMetadataInput,
	EditElement,
	EditState,
	EmbeddedFontAsset,
	FieldElement,
	FieldKind,
	ImageElement,
	LinkElement,
	OutlineItem,
	PageOp,
	PathElement,
	PolygonElement,
	ShapeElement,
	SignatureElement,
	TextElement,
	Watermark
} from '$lib/pdf/types';
import { flushSync } from 'svelte';
import { renderSourcePdf, type RenderedPage, PdfRenderError } from '$lib/pdf/render';
import { PdfDocStore } from '$lib/pdf/pdf-doc-store';
import { HistoryTimeline } from './editor-history.svelte';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { checkExportAllowance, reportExportError } from './gate.remote';
import { validateExportState } from './export-validate';
import { extractFieldsFromBytes } from './extract-fields-client';
import { extractAttachmentsFromBytes } from './extract-attachments-client';
import { decryptIfNeeded, DecryptCancelled, type PasswordResolver } from './decrypt-pdf';
import {
	DEFAULT_PAGE,
	SCALE,
	MAX_PDF_BYTES,
	MAX_IMAGE_BYTES,
	MAX_FONT_BYTES,
	MAX_ATTACHMENT_BYTES,
	SIGNATURE_DEFAULT_WIDTH,
	IMAGE_DEFAULT_WIDTH,
	SHAPE_DEFAULT_STROKE,
	SHAPE_DEFAULT_STROKE_WIDTH,
	SHAPE_MIN_SIZE,
	VECTOR_DEFAULT_STROKE_WIDTH,
	LINK_DEFAULT_SIZE,
	FIELD_DEFAULT_SIZE,
	SELECT_TOOL,
	ZOOM_MIN,
	ZOOM_MAX,
	ZOOM_STEP,
	HISTORY_LIMIT,
	HISTORY_DEBOUNCE_MS,
	type Tool,
	type DrawKind,
	type PageInfo,
	type PendingRaster
} from './constants';

/** Stable per-browser id, persisted in localStorage, sent with exports so the
 * server can rate-limit anonymous callers behind a shared IP. */
function getFingerprint(): string {
	const KEY = 'bpw:fingerprint';
	let fp = localStorage.getItem(KEY);
	if (!fp) {
		fp = crypto.randomUUID();
		localStorage.setItem(KEY, fp);
	}
	return fp;
}

/** Details surfaced when the export gate returns 429. Read by the upsell UI. */
export interface UpsellInfo {
	limit?: number;
	window?: number;
	/** Epoch ms when the actor can export again (oldest in-window event ages out). */
	retryAt?: number;
	upgradeUrl?: string;
}

/**
 * A point-in-time copy of the editable document, used for undo/redo. Holds only
 * the user-authored state (not transient UI, derived geometry, or the heavy
 * source renders); restoring it reproduces the document exactly. Selection is
 * carried so an undo also restores what was selected, but selection changes on
 * their own never create a history step.
 */
interface DocSnapshot {
	elements: EditElement[];
	pageOps: PageOp[];
	metadata: DocumentMetadataInput;
	outline: OutlineItem[];
	attachments: AttachmentInput[];
	flatten: boolean;
	optimizeSize: boolean;
	watermark: Watermark | null;
	embeddedFonts: Record<string, EmbeddedFontAsset>;
	selectedId: string | null;
}

/**
 * The editor's single source of truth: pages, elements, selection, and the
 * mutations that drive them. UI components (toolbar, canvas, overlays, modals)
 * read and call this; adding a feature means adding to this class and its
 * registries, not rewriting one giant component.
 */
export class EditorState {
	elements = $state<EditElement[]>([]);
	selectedId = $state<string | null>(null);
	/**
	 * Id of a text element just created that should grab keyboard focus so the
	 * user can type immediately (its overlay focuses + selects-all on mount, then
	 * clears this). Without it, a freshly-added text box stays unfocused and the
	 * first keystrokes are dropped until the user clicks it (#8).
	 */
	autoFocusTextId = $state<string | null>(null);
	/**
	 * Original source-page renders, indexed by their **original** zero-based page
	 * in the loaded PDF. Stays fixed after load; page operations reorder via
	 * {@link pageOps} (which carries `sourceIndex`) rather than by mutating this.
	 * Empty in blank mode.
	 */
	/**
	 * Rendered pages per source document. `renderedByDoc[d][i]` is the i-th page
	 * of source document `d`. Index 0 is the primary (first-uploaded) document;
	 * later indices are appended (merged) documents. Stays fixed after each load;
	 * page operations reference renders via `(docIndex, sourceIndex)`.
	 */
	renderedByDoc = $state<RenderedPage[][]>([]);
	/** Raw bytes per source document, parallel to {@link renderedByDoc}. */
	sources = $state<Uint8Array[]>([]);
	/**
	 * Snapshot of the fields extracted from source 0 at load time (provenance
	 * for the incremental export path — see EditState.sourceFields). Never
	 * mutated after load; cleared with the source.
	 */
	sourceFields = $state<FieldElement[]>([]);
	/** Renders of the primary document. Back-compat alias for `renderedByDoc[0]`. */
	rendered = $derived<RenderedPage[]>(this.renderedByDoc[0] ?? []);
	/** Bytes of the primary document, or null in blank mode. */
	sourceBytes = $derived<Uint8Array | null>(this.sources[0] ?? null);
	/**
	 * Ordered output pages (reorder / delete / insert-blank / rotate). One entry
	 * per visible page, in display order — this is exactly what the exporter
	 * receives. Element `page` indices are positions into this list. In blank
	 * mode (no source) it stays empty and {@link pages} falls back to a single
	 * default page.
	 */
	pageOps = $state<PageOp[]>([]);

	/**
	 * Per-page geometry for the canvas, derived from {@link pageOps}. In blank
	 * mode (no page ops) it is a single default page. Rotation by 90/270 swaps
	 * width/height so the displayed box matches the exported rotated page.
	 */
	pages = $derived<PageInfo[]>(
		this.pageOps.length === 0
			? [{ width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] }]
			: this.pageOps.map((op) => {
					let w: number;
					let h: number;
					if (op.kind === 'source') {
						// An explicit size override wins over the source page's size.
						if (op.size) {
							[w, h] = op.size;
						} else {
							const render = this.renderedByDoc[op.docIndex ?? 0]?.[op.sourceIndex];
							w = render?.width ?? DEFAULT_PAGE[0];
							h = render?.height ?? DEFAULT_PAGE[1];
						}
					} else {
						[w, h] = op.size;
					}
					return op.rotation % 180 === 0 ? { width: w, height: h } : { width: h, height: w };
				})
	);

	pendingSignature = $state<PendingRaster | null>(null);
	pendingImage = $state<PendingRaster | null>(null);

	/** Active tool. `select` (default) edits existing elements; a `draw` tool
	 * makes the next page click/drag create that element, then resets to select. */
	tool = $state<Tool>(SELECT_TOOL);
	/** The draw kind in effect, or null when selecting. */
	activeDrawKind = $derived<DrawKind | null>(this.tool.type === 'draw' ? this.tool.kind : null);
	/** The field kind in effect, or null when not placing a field. */
	activeFieldKind = $derived<FieldKind | null>(this.tool.type === 'field' ? this.tool.kind : null);
	/** Stroke color applied to newly drawn shapes (RGB 0..1). */
	shapeStroke = $state<{ r: number; g: number; b: number }>({ ...SHAPE_DEFAULT_STROKE });

	/**
	 * Id of the polygon currently being drawn vertex-by-vertex, or null. While
	 * non-null, page clicks add a vertex; Enter/double-click closes it and Esc
	 * cancels (removing it). Drives the in-progress overlay highlight.
	 */
	polygonDraftId = $state<string | null>(null);

	/** True while the field-properties modal is open for the selected field. */
	fieldModalOpen = $state(false);

	/**
	 * Set true at the end of a drag-draw (shape/path/link) so the synthetic
	 * `click` that fires right after pointerup doesn't deselect the element the
	 * user just created. Read and cleared by the canvas click handler.
	 */
	suppressNextClick = false;

	/**
	 * Canvas zoom multiplier (1 = 100%). Clamped to [{@link ZOOM_MIN},
	 * {@link ZOOM_MAX}]. Applied as a CSS transform on the page wrapper; pointer
	 * math divides by {@link cssScale} so drawing/dragging land correctly.
	 */
	zoom = $state(1);
	/** CSS px per PDF point at the current zoom — used in all pointer→point math. */
	cssScale = $derived(SCALE * this.zoom);
	/** Live canvas-area width (CSS px), bound from the Canvas component for fit-to-width. */
	canvasWidth = $state(0);

	/** Document metadata applied on export (title/author/etc.). */
	metadata = $state<DocumentMetadataInput>({});
	/** Document outline (bookmarks) applied on export when non-empty. */
	outline = $state<OutlineItem[]>([]);
	/** Files embedded in the exported PDF (document-level). */
	attachments = $state<AttachmentInput[]>([]);
	/** Names of attachments present in source 0 at load (provenance for the
	 * incremental export path — see EditState.sourceAttachmentNames). */
	sourceAttachmentNames = $state<string[]>([]);
	/** When true, fields are flattened (baked) on export. */
	flatten = $state(false);
	/**
	 * When true, the export uses object-stream compression for a smaller file
	 * (PDF 1.5+, not PDF/A-1 conformant). Opt-in; defaults off.
	 */
	optimizeSize = $state(false);
	/** Optional text watermark stamped on every page at export. */
	watermark = $state<Watermark | null>(null);
	/** True while the watermark editor modal is open. */
	watermarkModalOpen = $state(false);
	/** True while the document-properties modal is open. */
	docPropsModalOpen = $state(false);
	/** True while the attachments modal is open. */
	attachmentsModalOpen = $state(false);
	/** True while the outline editor is open. */
	outlineEditorOpen = $state(false);
	/** Whether the Pages thumbnail sidebar is shown. Collapsible to free up room
	 * for the page on small screens. */
	showPages = $state(true);

	exporting = $state(false);
	loadingPdf = $state(false);
	errorMessage = $state<string | null>(null);
	/** Non-null when the last export was rate-limited; the upsell modal reads it. */
	upsell = $state<UpsellInfo | null>(null);

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

	#nextId = 0;
	/** Object URLs for raster previews, cached per element id. Not reactive. */
	#rasterUrls: Record<string, string> = {};
	/** Live pdf.js documents per source index, for re-rasterising on zoom. Not
	 * reactive — components await {@link getPdfDoc}; the PNG placeholder covers
	 * the gap before the sharp canvas paints. */
	#docStore = new PdfDocStore();

	/**
	 * Custom fonts uploaded in this session, keyed by asset id. A Record (not a
	 * Map) so it works in reactive Svelte state under the project's eslint rules.
	 * Referenced by {@link TextElement.fontId}; included in the export state.
	 */
	embeddedFonts = $state<Record<string, EmbeddedFontAsset>>({});

	// --- undo / redo ---------------------------------------------------------
	// History is captured reactively: one effect deep-reads every authored field,
	// so any mutation anywhere (a method, a modal, a drag handler) is recorded
	// without each call site having to opt in. The {@link HistoryTimeline} owns
	// the stacks, the debounce, and the committed baseline; this class only
	// supplies the document-specific snapshot/serialize/apply hooks and the
	// tracking effect that tells the timeline when to record.
	// Initialized as a field (not in the constructor) so the reactive depth
	// `$derived`s below can reference it; its `snapshot` hook reads the document
	// `$state` declared above, which is already initialized at this point.
	#history: HistoryTimeline<DocSnapshot> = new HistoryTimeline<DocSnapshot>(
		{
			snapshot: () => this.#takeSnapshot(),
			serialize: (snap) => this.#serialize(snap),
			apply: (snap) => this.#applySnapshot(snap)
		},
		{ limit: HISTORY_LIMIT, debounceMs: HISTORY_DEBOUNCE_MS }
	);
	/** True while applying a snapshot, so the tracking effect ignores its writes. */
	#applying = false;
	#historyCleanup: (() => void) | null = null;
	/** Reactive stack depths, mirrored from the timeline for the toolbar. */
	undoDepth = $derived(this.#history.undoDepth);
	redoDepth = $derived(this.#history.redoDepth);
	canUndo = $derived(this.#history.canUndo);
	canRedo = $derived(this.#history.canRedo);
	/**
	 * True once the user has made at least one change since the document was
	 * loaded/started — i.e. there's authored work that lives only in this tab and
	 * would be lost on close/reload (nothing persists; export is the way to keep
	 * it). A freshly loaded PDF with no edits is not "unsaved": the original file
	 * still exists. Drives the toolbar status and the beforeunload guard.
	 */
	hasUnsavedWork = $derived(this.#history.undoDepth > 0);

	constructor() {
		// Run the tracking effect in its own root so it lives for the editor's
		// lifetime (not a component's); dispose() tears it down.
		this.#historyCleanup = $effect.root(() => {
			$effect(() => {
				// Deep-read every authored field to subscribe to nested mutations
				// (drag moves a coord, typing edits text, a modal sets a prop).
				// Selection is intentionally NOT read: selecting must not record a step.
				this.#track(this.elements);
				this.#track(this.pageOps);
				this.#track(this.metadata);
				this.#track(this.outline);
				this.#track(this.attachments);
				this.#track(this.watermark);
				this.#track(this.embeddedFonts);
				void this.flatten;
				void this.optimizeSize;
				if (this.#applying) return;
				this.#history.record();
			});
		});
	}

	/**
	 * Subscribe an effect to every reactive leaf under `v` without cloning. For
	 * binary blobs we read only `.length` (enough to notice a replacement) so we
	 * never copy megabytes of image/font bytes on every keystroke or drag frame.
	 */
	#track(v: unknown): void {
		if (v == null) return;
		if (v instanceof Uint8Array) {
			void v.length;
			return;
		}
		if (Array.isArray(v)) {
			for (const item of v) this.#track(item);
			return;
		}
		if (typeof v === 'object') {
			for (const key in v) this.#track((v as Record<string, unknown>)[key]);
		}
	}

	#takeSnapshot(): DocSnapshot {
		return $state.snapshot({
			elements: this.elements,
			pageOps: this.pageOps,
			metadata: this.metadata,
			outline: this.outline,
			attachments: this.attachments,
			flatten: this.flatten,
			optimizeSize: this.optimizeSize,
			watermark: this.watermark,
			embeddedFonts: this.embeddedFonts,
			selectedId: this.selectedId
		}) as DocSnapshot;
	}

	/** Stable serialization for change detection. `selectedId` is excluded so a
	 * pure selection change is never a recordable edit (it's still carried in the
	 * snapshot, so undo restores it). Uint8Array can't round-trip through JSON, so
	 * collapse it to a length tag — paired with the scalar fields that always
	 * change alongside binary, this reliably flags real edits. */
	#serialize(s: DocSnapshot): string {
		return JSON.stringify(s, (key, value) => {
			if (key === 'selectedId') return undefined;
			return value instanceof Uint8Array ? `u8:${value.byteLength}` : value;
		});
	}

	/** Restore a snapshot onto the live document (the timeline's `apply` hook). */
	#applySnapshot(snap: DocSnapshot): void {
		this.#applying = true;
		// Clone so later edits don't mutate the copy still held on a stack.
		const c = structuredClone(snap);
		this.elements = c.elements;
		this.pageOps = c.pageOps;
		this.metadata = c.metadata;
		this.outline = c.outline;
		this.attachments = c.attachments;
		this.flatten = c.flatten;
		this.optimizeSize = c.optimizeSize;
		this.watermark = c.watermark;
		this.embeddedFonts = c.embeddedFonts;
		this.selectedId = c.selectedId;
		// Run the tracking effect now, while #applying suppresses it, so the
		// restore itself doesn't schedule a bogus commit.
		flushSync();
		this.#applying = false;
	}

	/** Commit any pending edit as a single undo step. Called synchronously before
	 * undo/redo (the timeline does this internally too) and exposed for tests. */
	flushHistory(): void {
		this.#history.flush();
	}

	undo(): void {
		this.#history.undo();
	}

	redo(): void {
		this.#history.redo();
	}

	selected = $derived(this.elements.find((e) => e.id === this.selectedId) ?? null);
	selectedText = $derived(this.selected?.type === 'text' ? this.selected : null);
	selectedImage = $derived(this.selected?.type === 'image' ? this.selected : null);
	selectedSignature = $derived(this.selected?.type === 'signature' ? this.selected : null);
	/** An image or signature — both expose width/height for manual sizing. */
	selectedRaster = $derived<ImageElement | SignatureElement | null>(
		this.selected?.type === 'image' || this.selected?.type === 'signature' ? this.selected : null
	);
	selectedShape = $derived(this.selected?.type === 'shape' ? this.selected : null);
	selectedField = $derived(this.selected?.type === 'field' ? this.selected : null);
	selectedPath = $derived(this.selected?.type === 'path' ? this.selected : null);
	selectedPolygon = $derived(this.selected?.type === 'polygon' ? this.selected : null);
	selectedLink = $derived(this.selected?.type === 'link' ? this.selected : null);
	/** Links with neither a non-empty URL nor a page target. They author nothing
	 * at export (the renderer skips them), so warn the user instead of silently
	 * dropping them (#3). */
	invalidLinks = $derived(
		this.elements.filter(
			(e) =>
				e.type === 'link' &&
				!(typeof e.url === 'string' && e.url.length > 0) &&
				typeof e.goToPage !== 'number'
		)
	);
	/** A path or polygon — both share the same stroke/fill/opacity controls. */
	selectedVector = $derived<PathElement | PolygonElement | null>(
		this.selected?.type === 'path' || this.selected?.type === 'polygon' ? this.selected : null
	);

	nextId(prefix: string): string {
		return `${prefix}${this.#nextId++}`;
	}

	select(id: string | null) {
		this.selectedId = id;
	}

	add(element: EditElement) {
		this.elements.push(element);
		this.selectedId = element.id;
	}

	removeSelected() {
		if (this.selectedId) {
			this.elements = this.elements.filter((e) => e.id !== this.selectedId);
			this.selectedId = null;
		}
	}

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
		// Fields must keep unique names; a clone gets a fresh suggested name.
		if (clone.type === 'field') clone.name = this.uniqueFieldName(clone.field);
		this.add(clone);
	}

	elementsForPage(pageIndex: number): EditElement[] {
		return this.elements.filter((e) => (e.page ?? 0) === pageIndex);
	}

	/** Source-page render to display behind an output page, or null for blanks. */
	pageRender(pageIndex: number): RenderedPage | null {
		const op = this.pageOps[pageIndex];
		if (!op || op.kind !== 'source') return null;
		return this.renderedByDoc[op.docIndex ?? 0]?.[op.sourceIndex] ?? null;
	}

	/** Clockwise rotation (0/90/180/270) of an output page, for display. */
	pageRotation(pageIndex: number): number {
		return this.pageOps[pageIndex]?.rotation ?? 0;
	}

	/**
	 * The un-rotated content box (PDF points) the page's background fills — the
	 * size override when set, else the source render size, else the default. The
	 * preview must scale the source image to this box so it matches the export,
	 * which draws the embedded page stretched to fill it ({@link buildSourceRebuild}).
	 * Unlike {@link pages}, this is never width/height-swapped for rotation, because
	 * the source content is drawn into the box *before* the page rotation applies.
	 */
	pageContentBox(pageIndex: number): { width: number; height: number } {
		const op = this.pageOps[pageIndex];
		if (!op) return { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
		if (op.kind === 'source') {
			if (op.size) return { width: op.size[0], height: op.size[1] };
			const render = this.renderedByDoc[op.docIndex ?? 0]?.[op.sourceIndex];
			return {
				width: render?.width ?? DEFAULT_PAGE[0],
				height: render?.height ?? DEFAULT_PAGE[1]
			};
		}
		return { width: op.size[0], height: op.size[1] };
	}

	// --- page operations -----------------------------------------------------

	/**
	 * Shift every element's `page` index to follow a remap of output positions.
	 * `remap[newIndex] = oldIndex | -1` (−1 means the page is freshly inserted and
	 * carries no prior elements). Elements on dropped pages are removed.
	 */
	#remapElementPages(remap: number[]) {
		// Local, non-reactive lookup: oldPageIndex -> newPageIndex (-1 entries skipped).
		const oldToNew: Record<number, number> = {};
		remap.forEach((oldIndex, newIndex) => {
			if (oldIndex >= 0) oldToNew[oldIndex] = newIndex;
		});
		this.elements = this.elements.filter((e) => (e.page ?? 0) in oldToNew);
		for (const e of this.elements) {
			const next = oldToNew[e.page ?? 0];
			if (next !== undefined) e.page = next;
		}
	}

	/** Move the page at `from` to `to` (output positions). */
	movePage(from: number, to: number) {
		const n = this.pageOps.length;
		if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
		const ops = this.pageOps.slice();
		const [op] = ops.splice(from, 1);
		if (!op) return;
		ops.splice(to, 0, op);
		const remap = Array.from({ length: n }, (_, i) => i);
		remap.splice(from, 1);
		remap.splice(to, 0, from);
		this.pageOps = ops;
		this.#remapElementPages(remap);
		this.selectedId = null;
	}

	/** Move a page up one position (toward the front). */
	movePageUp(index: number) {
		this.movePage(index, index - 1);
	}

	/** Move a page down one position (toward the back). */
	movePageDown(index: number) {
		this.movePage(index, index + 1);
	}

	/** Delete the output page at `index` and drop its elements. */
	deletePage(index: number) {
		if (this.pageOps.length <= 1) return; // keep at least one page
		if (index < 0 || index >= this.pageOps.length) return;
		const remap = this.pageOps.map((_, i) => i).filter((i) => i !== index);
		this.pageOps = this.pageOps.filter((_, i) => i !== index);
		this.#remapElementPages(remap);
		this.selectedId = null;
	}

	/** Rotate the output page at `index` clockwise by 90°. */
	rotatePage(index: number) {
		const op = this.pageOps[index];
		if (!op) return;
		op.rotation = (op.rotation + 90) % 360;
	}

	/** Insert a blank page after `afterIndex` (−1 inserts at the front). With no
	 * `size`, matches the first page's dimensions; pass an explicit [w, h] in PDF
	 * points to set a specific page size (#5). */
	insertBlankPage(afterIndex: number, size?: [number, number]) {
		// Match the dominant page size (first source page) so blanks fit in.
		const first = this.pages[0] ?? { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
		const dims: [number, number] = size ?? [first.width, first.height];
		const blank: PageOp = { kind: 'blank', size: dims, rotation: 0 };
		// Blank mode has no page ops yet — materialise the implicit first page so
		// the new page is added alongside it (rather than replacing it).
		if (this.pageOps.length === 0) {
			this.pageOps = [{ kind: 'blank', size: [first.width, first.height], rotation: 0 }];
		}
		const at = afterIndex + 1;
		const ops = this.pageOps.slice();
		ops.splice(at, 0, blank);
		const remap = this.pageOps.map((_, i) => i);
		remap.splice(at, 0, -1);
		this.pageOps = ops;
		this.#remapElementPages(remap);
		this.selectedId = null;
	}

	/**
	 * Duplicate the page at `index`, inserting the copy immediately after it. The
	 * page op (size/rotation/source ref) is cloned, and every element on the page
	 * is deep-cloned onto the new page with fresh ids (and unique field names).
	 */
	duplicatePage(index: number) {
		// Materialise the implicit first page in blank mode so the copy is added
		// alongside it rather than replacing it (mirrors insertBlankPage).
		if (this.pageOps.length === 0) {
			const first = this.pages[0] ?? { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
			this.pageOps = [{ kind: 'blank', size: [first.width, first.height], rotation: 0 }];
		}
		const op = this.pageOps[index];
		if (!op) return;
		const at = index + 1;
		const ops = this.pageOps.slice();
		ops.splice(at, 0, $state.snapshot(op) as PageOp);
		// Shift elements on pages ≥ `at` up by one; the source page (at `index`,
		// before the insert point) keeps its elements.
		const remap = this.pageOps.map((_, i) => i);
		remap.splice(at, 0, -1);
		this.pageOps = ops;
		this.#remapElementPages(remap);
		// Copy the source page's elements onto the new page. Iterate a filtered
		// snapshot and push each clone immediately so uniqueFieldName sees prior
		// clones and never hands two duplicates the same name.
		const source = this.elements.filter((e) => (e.page ?? 0) === index);
		for (const el of source) {
			const clone = {
				...$state.snapshot(el),
				id: this.nextId(el.type[0] ?? 'e'),
				page: at
			} as EditElement;
			if (clone.type === 'field') clone.name = this.uniqueFieldName(clone.field);
			this.elements.push(clone);
		}
		this.selectedId = null;
	}

	// --- placement -----------------------------------------------------------

	addTextAt(x: number, y: number, pageIndex: number) {
		const id = this.nextId('t');
		this.add({
			type: 'text',
			id,
			text: 'New text',
			x,
			y,
			size: 16,
			page: pageIndex
		});
		// Focus the new box so the user can type right away (#8).
		this.autoFocusTextId = id;
	}

	placeSignatureAt(x: number, y: number, pageIndex: number) {
		const pending = this.pendingSignature;
		if (!pending) return;
		const width = SIGNATURE_DEFAULT_WIDTH;
		this.add({
			type: 'signature',
			id: this.nextId('s'),
			x,
			y,
			width,
			height: width / pending.aspect,
			page: pageIndex,
			image: pending.image,
			format: pending.format
		});
		this.pendingSignature = null;
	}

	placeImageAt(x: number, y: number, pageIndex: number) {
		const pending = this.pendingImage;
		if (!pending) return;
		const width = IMAGE_DEFAULT_WIDTH;
		this.add({
			type: 'image',
			id: this.nextId('i'),
			x,
			y,
			width,
			height: width / pending.aspect,
			page: pageIndex,
			image: pending.image,
			format: pending.format
		});
		this.pendingImage = null;
	}

	/**
	 * Suggest a unique AcroForm field name for a new field of `kind`, e.g.
	 * `text1`, `checkbox2`. Counts up until the name is free among existing
	 * field elements.
	 */
	uniqueFieldName(kind: FieldKind): string {
		const taken = this.elements
			.filter((e) => e.type === 'field')
			.map((e) => (e as FieldElement).name)
			.concat(this.sourceFieldNames.flat());
		let n = 1;
		while (taken.includes(`${kind}${n}`)) n++;
		return `${kind}${n}`;
	}

	/**
	 * True if `name` is already used by a field element other than the one with
	 * `exceptId`. Drives the modal's inline duplicate-name validation.
	 */
	fieldNameTaken(name: string, exceptId: string): boolean {
		return this.elements.some(
			(e) => e.type === 'field' && e.id !== exceptId && (e as FieldElement).name === name
		);
	}

	/** Raw field-name lists per source doc (index = docIndex), for collision validation. */
	sourceFieldNames = $state<string[][]>([]);

	/** True if `name` exists in any loaded source PDF's original AcroForm. */
	sourceNameTaken(name: string): boolean {
		return this.sourceFieldNames.some((names) => names.includes(name));
	}

	/** Create a new field of `kind` at top-left PDF-point coords on a page. */
	placeFieldAt(kind: FieldKind, x: number, y: number, pageIndex: number) {
		const size = FIELD_DEFAULT_SIZE[kind];
		const options =
			kind === 'dropdown' || kind === 'combo' || kind === 'listbox' || kind === 'radio'
				? ['Option 1', 'Option 2']
				: undefined;
		const el: FieldElement = {
			type: 'field',
			id: this.nextId('f'),
			field: kind,
			name: this.uniqueFieldName(kind),
			x,
			y,
			width: size.width,
			height: size.height,
			page: pageIndex,
			...(options ? { options } : {}),
			// Radios start with each button stacked below the anchor; the user can
			// then drag any of them anywhere on the page (#3).
			...(kind === 'radio'
				? { radioLayout: radioStack(x, y, Math.min(size.width, size.height), options!.length) }
				: {})
		};
		this.add(el);
	}

	/**
	 * Ensure `field.radioLayout` exists and is index-aligned with `options`, filling
	 * any missing slots from the default vertical stack. Returns the live array.
	 */
	ensureRadioLayout(field: FieldElement): { x: number; y: number }[] {
		const size = Math.min(field.width, field.height);
		const opts = field.options ?? [];
		const cur = field.radioLayout ?? [];
		const stack = radioStack(field.x, field.y, size, opts.length);
		const next = opts.map((_, i) => cur[i] ?? stack[i]!);
		field.radioLayout = next;
		return next;
	}

	/** Append a new radio option, stacking its button below the current last one. */
	addRadioOption(field: FieldElement) {
		// Materialise the layout for the CURRENT options first, then append the
		// option and its slot together so the two arrays stay length-aligned.
		const layout = this.ensureRadioLayout(field);
		const i = field.options?.length ?? 0;
		const size = Math.min(field.width, field.height);
		const last = layout[i - 1];
		field.options = [...(field.options ?? []), `Option ${i + 1}`];
		field.radioLayout = [
			...layout,
			last ? { x: last.x, y: last.y + size + 6 } : { x: field.x, y: field.y }
		];
	}

	/** Set a raster element's width/height in PDF points (manual sizing), clamped
	 * to a small minimum so it never collapses. */
	setRasterSize(el: ImageElement | SignatureElement, width?: number, height?: number) {
		if (width !== undefined && Number.isFinite(width)) el.width = Math.max(4, width);
		if (height !== undefined && Number.isFinite(height)) el.height = Math.max(4, height);
	}

	/**
	 * Drive a window-level pointer-drag gesture. `move` runs on every pointermove;
	 * `end` runs once when the gesture finishes — either a normal pointerup or a
	 * pointercancel (a touch pinch/scroll the browser reclaims). All listeners are
	 * removed before `end` runs, so each caller only describes the work. Handling
	 * pointercancel is what keeps mobile draws/drags from being silently abandoned.
	 */
	#trackGesture(move: (e: PointerEvent) => void, end: () => void = () => {}) {
		const finish = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', finish);
			window.removeEventListener('pointercancel', finish);
			end();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', finish);
		window.addEventListener('pointercancel', finish);
	}

	/** Drag a single radio button (option `index`) to a new position on its page. */
	startRadioDrag(event: PointerEvent, field: FieldElement, index: number) {
		this.selectedId = field.id;
		const layout = this.ensureRadioLayout(field);
		const origin = layout[index] ?? { x: field.x, y: field.y };
		const startX = event.clientX;
		const startY = event.clientY;
		let dragging = false;

		const move = (e: PointerEvent) => {
			if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
			dragging = true;
			const dx = (e.clientX - startX) / this.cssScale;
			const dy = (e.clientY - startY) / this.cssScale;
			field.radioLayout = (field.radioLayout ?? layout).map((p, i) =>
				i === index ? { x: origin.x + dx, y: origin.y + dy } : p
			);
		};
		// A plain click (no drag past the threshold) selects that option — this is
		// the only way to set a radio group's value; export reads it from field.value.
		const end = () => {
			if (!dragging) {
				const opt = field.options?.[index];
				if (opt !== undefined) field.value = opt;
			}
		};
		this.#trackGesture(move, end);
	}

	/** Clamp a top-left PDF point to its page bounds so nothing is placed or drawn
	 * off the paper (#1). Unknown page size passes through with a >=0 floor. */
	clampToPage(x: number, y: number, pageIndex: number): { x: number; y: number } {
		const page = this.pages[pageIndex];
		if (!page) return { x: Math.max(0, x), y: Math.max(0, y) };
		return {
			x: Math.min(Math.max(0, x), page.width),
			y: Math.min(Math.max(0, y), page.height)
		};
	}

	/** Clamp a box's top-left so the whole `w`×`h` box stays within its page (#1). */
	clampBox(
		x: number,
		y: number,
		w: number,
		h: number,
		pageIndex: number
	): { x: number; y: number } {
		const page = this.pages[pageIndex];
		if (!page) return { x: Math.max(0, x), y: Math.max(0, y) };
		return {
			x: Math.min(Math.max(0, x), Math.max(0, page.width - w)),
			y: Math.min(Math.max(0, y), Math.max(0, page.height - h))
		};
	}

	/** Handle a click on the bare page background at canvas px coords. Only an
	 * active draw or field tool creates; shape kinds are drawn by drag, not click. */
	placeAtClient(clientX: number, clientY: number, pageEl: HTMLElement, pageIndex: number) {
		const rect = pageEl.getBoundingClientRect();
		const { x, y } = this.clampToPage(
			(clientX - rect.left) / this.cssScale,
			(clientY - rect.top) / this.cssScale,
			pageIndex
		);

		if (this.tool.type === 'field') {
			this.placeFieldAt(this.tool.kind, x, y, pageIndex);
			this.resetTool();
			return;
		}

		if (this.tool.type !== 'draw') return;
		const kind = this.tool.kind;
		// Drag-drawn kinds are committed on pointerdown→up, not on click.
		if (
			kind === 'line' ||
			kind === 'rectangle' ||
			kind === 'ellipse' ||
			kind === 'path' ||
			kind === 'link'
		) {
			return;
		}

		// Polygon is multi-click: add a vertex and keep the tool active.
		if (kind === 'polygon') {
			this.addPolygonVertex(x, y, pageIndex);
			return;
		}

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

	// --- shapes --------------------------------------------------------------

	/** Activate a tool. Entering a create tool clears the current selection. */
	setTool(tool: Tool) {
		this.tool = tool;
		if (tool.type === 'draw' || tool.type === 'field') this.selectedId = null;
	}

	/** Return to the idle select tool. */
	resetTool() {
		this.tool = SELECT_TOOL;
	}

	/**
	 * Shared press-drag draw lifecycle. Captures the pointer on `pageEl`, converts
	 * client coords to clamped top-left PDF points, creates the element via
	 * `create(start)`, runs `onMove(live, cur, start)` on every pointermove, and
	 * `commit(live)` once on release — then suppresses the trailing synthetic
	 * click and returns to the select tool. The per-kind callers only describe the
	 * element shape and how a drag mutates it; the gesture plumbing lives here.
	 */
	#beginDraw<T extends EditElement>(
		event: PointerEvent,
		pageEl: HTMLElement,
		pageIndex: number,
		create: (start: { x: number; y: number }) => T,
		onMove: (live: T, cur: { x: number; y: number }, start: { x: number; y: number }) => void,
		commit: (live: T) => void
	): boolean {
		event.preventDefault();
		pageEl.setPointerCapture(event.pointerId);
		const rect = pageEl.getBoundingClientRect();
		const at = (e: PointerEvent) =>
			this.clampToPage(
				(e.clientX - rect.left) / this.cssScale,
				(e.clientY - rect.top) / this.cssScale,
				pageIndex
			);
		const start = at(event);
		this.add(create(start));
		// Use the reactive proxy version so mutations trigger re-renders.
		const live = this.elements[this.elements.length - 1] as T;

		this.#trackGesture(
			(e) => onMove(live, at(e), start),
			() => {
				commit(live);
				// One-shot tool: return to select after drawing.
				this.suppressNextClick = true;
				this.resetTool();
			}
		);
		return true;
	}

	/**
	 * Begin drawing a shape: press defines one corner, drag sizes the bounding
	 * box, release commits it. No-op (returns false) when no shape tool is active
	 * so the page keeps its normal click-to-add-text behaviour. Called from the
	 * page's pointerdown.
	 */
	beginShapeDraw(event: PointerEvent, pageEl: HTMLElement, pageIndex: number): boolean {
		const kind =
			this.tool.type === 'draw' &&
			(this.tool.kind === 'line' || this.tool.kind === 'rectangle' || this.tool.kind === 'ellipse')
				? this.tool.kind
				: null;
		if (!kind) return false;
		const stroke = $state.snapshot(this.shapeStroke);
		return this.#beginDraw<ShapeElement>(
			event,
			pageEl,
			pageIndex,
			(start) => ({
				type: 'shape',
				id: this.nextId('sh'),
				shape: kind,
				x: start.x,
				y: start.y,
				width: 0,
				height: 0,
				page: pageIndex,
				strokeColor: stroke,
				strokeWidth: SHAPE_DEFAULT_STROKE_WIDTH
			}),
			(live, cur, start) => {
				live.x = Math.min(start.x, cur.x);
				live.y = Math.min(start.y, cur.y);
				live.width = Math.abs(cur.x - start.x);
				live.height = Math.abs(cur.y - start.y);
				// A line keeps its drag direction: anti-diagonal when X and Y move in
				// opposite directions (top-right → bottom-left or bottom-left → top-right).
				if (live.shape === 'line') live.antidiagonal = (cur.x - start.x) * (cur.y - start.y) < 0;
			},
			(live) => {
				// A stray click with no real drag still yields a visible default shape.
				if (live.width < SHAPE_MIN_SIZE) live.width = SHAPE_MIN_SIZE * 4;
				if (live.shape !== 'line' && live.height < SHAPE_MIN_SIZE) live.height = SHAPE_MIN_SIZE * 4;
			}
		);
	}

	// --- vector paths / polygons / links -------------------------------------

	/**
	 * Begin a freehand path: pointerdown starts it, each pointermove samples a
	 * point, pointerup commits it (`closed:false`) and resets to select. Returns
	 * false (no-op) when the path tool isn't active. Points are absolute
	 * top-left-origin PDF points.
	 */
	beginFreehandDraw(event: PointerEvent, pageEl: HTMLElement, pageIndex: number): boolean {
		if (!(this.tool.type === 'draw' && this.tool.kind === 'path')) return false;
		const stroke = $state.snapshot(this.shapeStroke);
		return this.#beginDraw<PathElement>(
			event,
			pageEl,
			pageIndex,
			(start) => ({
				type: 'path',
				id: this.nextId('pa'),
				x: start.x,
				y: start.y,
				page: pageIndex,
				points: [start],
				closed: false,
				strokeColor: stroke,
				strokeWidth: VECTOR_DEFAULT_STROKE_WIDTH
			}),
			(live, p) => {
				// Skip near-duplicate samples to keep the point list manageable.
				const last = live.points[live.points.length - 1];
				if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1) return;
				live.points = [...live.points, p];
				const box = boundingBox(live.points);
				live.x = box.x;
				live.y = box.y;
			},
			(live) => {
				// Discard single-point taps that produce no visible stroke.
				if (live.points.length < 2) {
					this.elements = this.elements.filter((e) => e.id !== live.id);
					this.selectedId = null;
				}
			}
		);
	}

	/**
	 * Begin a link rect: press one corner, drag to size, release commits a
	 * {@link LinkElement} (default empty `url`) and resets to select. The floating
	 * toolbar then edits the target. Returns false when the link tool isn't active.
	 */
	beginLinkDraw(event: PointerEvent, pageEl: HTMLElement, pageIndex: number): boolean {
		if (!(this.tool.type === 'draw' && this.tool.kind === 'link')) return false;
		return this.#beginDraw<LinkElement>(
			event,
			pageEl,
			pageIndex,
			(start) => ({
				type: 'link',
				id: this.nextId('ln'),
				x: start.x,
				y: start.y,
				width: 0,
				height: 0,
				page: pageIndex,
				url: ''
			}),
			(live, cur, start) => {
				live.x = Math.min(start.x, cur.x);
				live.y = Math.min(start.y, cur.y);
				live.width = Math.abs(cur.x - start.x);
				live.height = Math.abs(cur.y - start.y);
			},
			(live) => {
				if (live.width < SHAPE_MIN_SIZE) live.width = LINK_DEFAULT_SIZE.width;
				if (live.height < SHAPE_MIN_SIZE) live.height = LINK_DEFAULT_SIZE.height;
			}
		);
	}

	/**
	 * Add a polygon vertex at top-left PDF-point coords. Starts a new draft on the
	 * first click and appends to it on subsequent clicks. The polygon tool stays
	 * active until {@link closePolygon} or {@link cancelPolygon}.
	 */
	addPolygonVertex(x: number, y: number, pageIndex: number) {
		const draft = this.polygonDraftId
			? this.elements.find((e) => e.id === this.polygonDraftId && e.type === 'polygon')
			: null;
		if (draft && draft.type === 'polygon') {
			draft.points = [...draft.points, { x, y }];
			const box = boundingBox(draft.points);
			draft.x = box.x;
			draft.y = box.y;
			return;
		}
		const stroke = $state.snapshot(this.shapeStroke);
		const el: PolygonElement = {
			type: 'polygon',
			id: this.nextId('pg'),
			x,
			y,
			page: pageIndex,
			points: [{ x, y }],
			closed: true,
			strokeColor: stroke,
			strokeWidth: VECTOR_DEFAULT_STROKE_WIDTH
		};
		this.add(el);
		this.polygonDraftId = el.id;
	}

	/**
	 * Finish the in-progress polygon. A polygon with fewer than 2 vertices is
	 * discarded (nothing to draw). Returns to the select tool.
	 */
	closePolygon() {
		const id = this.polygonDraftId;
		this.polygonDraftId = null;
		if (!id) return;
		const el = this.elements.find((e) => e.id === id);
		if (el && el.type === 'polygon' && el.points.length < 2) {
			this.elements = this.elements.filter((e) => e.id !== id);
			this.selectedId = null;
		}
		this.resetTool();
	}

	/** Abandon the in-progress polygon, removing it. Returns to the select tool. */
	cancelPolygon() {
		const id = this.polygonDraftId;
		this.polygonDraftId = null;
		if (id) {
			this.elements = this.elements.filter((e) => e.id !== id);
			if (this.selectedId === id) this.selectedId = null;
		}
		this.resetTool();
	}

	// --- drag / resize -------------------------------------------------------

	startDrag(event: PointerEvent, el: EditElement) {
		this.selectedId = el.id;
		const startX = event.clientX;
		const startY = event.clientY;
		const originX = el.x;
		const originY = el.y;
		// Path/polygon carry absolute points; snapshot them so the whole element
		// translates with the bounding box (x/y) rather than only the box moving.
		const hasPoints = el.type === 'path' || el.type === 'polygon';
		const originPoints = hasPoints ? el.points.map((p) => ({ x: p.x, y: p.y })) : null;
		// Extent used to keep the whole element on the page (#1). Points carry their
		// own bounding box; boxed elements use width/height.
		const ext = originPoints
			? {
					width: Math.max(...originPoints.map((p) => p.x)) - originX,
					height: Math.max(...originPoints.map((p) => p.y)) - originY
				}
			: { width: 'width' in el ? el.width : 0, height: 'height' in el ? el.height : 0 };
		const pageIndex = el.page ?? 0;
		let dragging = false;

		const move = (e: PointerEvent) => {
			// Threshold so a plain click still places the text caret for editing.
			if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
			dragging = true;
			const dx = (e.clientX - startX) / this.cssScale;
			const dy = (e.clientY - startY) / this.cssScale;
			// Clamp the target box on-page, then derive the actual delta so element
			// box and (for paths/polygons) points translate together.
			const c = this.clampBox(originX + dx, originY + dy, ext.width, ext.height, pageIndex);
			const adx = c.x - originX;
			const ady = c.y - originY;
			el.x = c.x;
			el.y = c.y;
			if (originPoints && (el.type === 'path' || el.type === 'polygon')) {
				el.points = originPoints.map((p) => ({ x: p.x + adx, y: p.y + ady }));
			}
		};
		this.#trackGesture(move);
	}

	startResize(
		event: PointerEvent,
		el: SignatureElement | ImageElement | ShapeElement | FieldElement | LinkElement
	) {
		event.stopPropagation();
		event.preventDefault();
		this.selectedId = el.id;
		const startX = event.clientX;
		const startY = event.clientY;
		const startWidth = el.width;
		const startHeight = el.height;
		// Rasters resize about their aspect ratio; shapes/fields/links resize freely.
		const free = el.type === 'shape' || el.type === 'field' || el.type === 'link';
		const aspect = el.width / el.height;

		const minSide = free ? SHAPE_MIN_SIZE : 20;
		const move = (e: PointerEvent) => {
			el.width = Math.max(minSide, startWidth + (e.clientX - startX) / this.cssScale);
			if (free) {
				el.height = Math.max(minSide, startHeight + (e.clientY - startY) / this.cssScale);
			} else {
				el.height = el.width / aspect;
			}
		};
		this.#trackGesture(move);
	}

	/** Cached object URL for a raster element's preview image. */
	rasterUrl(el: SignatureElement | ImageElement): string {
		const cached = this.#rasterUrls[el.id];
		if (cached) return cached;
		const type = el.format === 'png' ? 'image/png' : 'image/jpeg';
		const buf = new ArrayBuffer(el.image.byteLength);
		new Uint8Array(buf).set(el.image);
		const url = URL.createObjectURL(new Blob([buf], { type }));
		this.#rasterUrls[el.id] = url;
		return url;
	}

	// --- source PDF ----------------------------------------------------------

	async loadPdf(file: File) {
		this.errorMessage = null;
		if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			this.errorMessage = 'Please choose a PDF file.';
			return;
		}
		if (file.size > MAX_PDF_BYTES) {
			this.errorMessage = `That file is too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB).`;
			return;
		}

		this.loadingPdf = true;
		try {
			// A re-upload replaces source 0; drop any previously cached document so
			// the old proxy is freed and the new bytes are reopened on next render.
			void this.#docStore.destroyAll();
			const raw = new Uint8Array(await file.arrayBuffer());
			const { bytes, decrypted } = await decryptIfNeeded(raw, this.#requestPassword);
			if (decrypted) this.wasDecrypted = true;
			// pdf.js detaches the buffer it renders, so keep a copy for export.
			const exportCopy = bytes.slice();
			const result = await renderSourcePdf(bytes, SCALE);
			this.renderedByDoc = [result];
			// One source-page op per page, in original order, unrotated, from doc 0.
			this.pageOps = result.map((_, i) => ({
				kind: 'source',
				sourceIndex: i,
				rotation: 0,
				docIndex: 0
			}));
			this.sources = [exportCopy];
			this.selectedId = null;
			// Detect AcroForm fields (client-side WASM; bytes never leave the browser).
			// Failures are swallowed: the editor still opens for stamping with no
			// fields surfaced.
			let detected: FieldElement[] = [];
			try {
				const res = await extractFieldsFromBytes(exportCopy.slice());
				detected = res.fields as FieldElement[];
				this.sourceFieldNames = [res.allNames ?? []];
			} catch {
				detected = [];
				this.sourceFieldNames = [[]];
			}
			this.elements = detected;
			// Deep copy: field props (border, radioLayout, options…) are mutated in
			// place on the live elements, so the provenance baseline must not alias
			// any nested object. `detected` is plain JSON off the remote call.
			this.sourceFields = structuredClone(detected);
			// Read files already embedded in the uploaded PDF (client WASM). Failures
			// are swallowed — the editor still opens with no attachments surfaced.
			try {
				const atts = await extractAttachmentsFromBytes(exportCopy.slice(), () =>
					this.nextId('att')
				);
				this.attachments = atts;
				this.sourceAttachmentNames = atts.map((a) => a.name);
			} catch {
				this.attachments = [];
				this.sourceAttachmentNames = [];
			}
			// A freshly loaded document is a new baseline: undo shouldn't reach back
			// into whatever was open before (and across stale source references).
			this.#history.reset();
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
			this.loadingPdf = false;
		}
	}

	clearSource() {
		void this.#docStore.destroyAll();
		this.sources = [];
		this.renderedByDoc = [];
		this.pageOps = [];
		this.elements = [];
		this.sourceFields = [];
		this.sourceFieldNames = [];
		this.selectedId = null;
		this.errorMessage = null;
		this.wasDecrypted = false;
		this.passwordPrompt = null;
		this.pendingSignature = null;
		this.pendingImage = null;
		this.polygonDraftId = null;
		this.metadata = {};
		this.outline = [];
		this.attachments = [];
		this.sourceAttachmentNames = [];
		this.embeddedFonts = {};
		this.#history.reset();
	}

	/**
	 * Merge/append another PDF after the current pages. Renders the new document
	 * (client, pdf.js), stores its bytes as a new source doc, and appends one
	 * `source` page op per page tagged with the new `docIndex`. Works on a blank
	 * editor too (it becomes doc 0).
	 */
	async appendPdf(file: File) {
		this.errorMessage = null;
		if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			this.errorMessage = 'Please choose a PDF file.';
			return;
		}
		if (file.size > MAX_PDF_BYTES) {
			this.errorMessage = `That file is too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB).`;
			return;
		}
		this.loadingPdf = true;
		try {
			const raw = new Uint8Array(await file.arrayBuffer());
			const { bytes, decrypted } = await decryptIfNeeded(raw, this.#requestPassword);
			if (decrypted) this.wasDecrypted = true;
			const exportCopy = bytes.slice();
			const result = await renderSourcePdf(bytes, SCALE);
			const docIndex = this.renderedByDoc.length;
			this.renderedByDoc = [...this.renderedByDoc, result];
			this.sources = [...this.sources, exportCopy];
			// Size of the implicit blank page 0, captured before pageOps changes.
			const first = this.pages[0] ?? { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
			const appended: PageOp[] = result.map((_, i) => ({
				kind: 'source',
				sourceIndex: i,
				rotation: 0,
				docIndex
			}));
			// Blank editor: the visible page 0 is implicit (no page op). If the user
			// placed content on it, materialize it as a real blank op so that content
			// keeps its own page instead of aliasing the incoming doc's page 0. With
			// no content, drop the implicit blank so the merge has no leading blank.
			const base =
				this.pageOps.length === 0 && this.elements.length > 0
					? ([{ kind: 'blank', size: [first.width, first.height], rotation: 0 }] as PageOp[])
					: this.pageOps;
			this.pageOps = [...base, ...appended];
			this.selectedId = null;
			try {
				const res = await extractFieldsFromBytes(exportCopy.slice());
				this.sourceFieldNames = [...this.sourceFieldNames];
				this.sourceFieldNames[docIndex] = res.allNames ?? [];
			} catch {
				this.sourceFieldNames = [...this.sourceFieldNames];
				this.sourceFieldNames[docIndex] = [];
			}
			// Surface files already embedded in the merged-in document, mirroring the
			// primary-upload read-back in loadPdf. Failures are swallowed — the merge
			// still succeeds with no attachments surfaced.
			try {
				const atts = await extractAttachmentsFromBytes(exportCopy.slice(), () =>
					this.nextId('att')
				);
				this.mergeSourceAttachments(atts);
			} catch {
				// Attachment read-back failed — leave the current list untouched.
			}
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
			this.loadingPdf = false;
		}
	}

	/**
	 * Merge attachments read from a newly appended source document into the
	 * current list. Attachment names must stay unique in the output PDF, so any
	 * whose name already exists (in {@link attachments} or the source-provenance
	 * {@link sourceAttachmentNames}) is skipped — the file already present wins.
	 * Fresh names are added to {@link sourceAttachmentNames} so they show the "in
	 * source" badge and round-trip through the export like the primary document's
	 * attachments (the rebuild / assemble export paths re-embed them from bytes).
	 */
	mergeSourceAttachments(atts: AttachmentInput[]): void {
		if (atts.length === 0) return;
		const taken = new Set([...this.attachments.map((a) => a.name), ...this.sourceAttachmentNames]);
		const fresh = atts.filter((a) => !taken.has(a.name));
		if (fresh.length === 0) return;
		this.attachments = [...this.attachments, ...fresh];
		this.sourceAttachmentNames = [...this.sourceAttachmentNames, ...fresh.map((a) => a.name)];
	}

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
		this.#history.dispose();
		this.#historyCleanup?.();
		this.#historyCleanup = null;
	}

	// --- zoom ----------------------------------------------------------------

	/** Set the canvas zoom, clamped to [{@link ZOOM_MIN}, {@link ZOOM_MAX}]. */
	setZoom(z: number) {
		this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
	}

	/** Step zoom in/out by {@link ZOOM_STEP}. */
	zoomIn() {
		this.setZoom(this.zoom + ZOOM_STEP);
	}
	zoomOut() {
		this.setZoom(this.zoom - ZOOM_STEP);
	}
	resetZoom() {
		this.setZoom(1);
	}

	/**
	 * Fit the first page's width to `containerWidth` (CSS px), so one page width
	 * fills the available canvas area. Clamped to the zoom bounds.
	 */
	fitToWidth(containerWidth = this.canvasWidth) {
		const first = this.pages[0];
		// Account for the canvas padding (p-8 → 32px each side) so the page fits.
		const usable = containerWidth - 64;
		if (!first || first.width <= 0 || usable <= 0) return;
		// usable = first.width * SCALE * zoom  →  solve for zoom.
		this.setZoom(usable / (first.width * SCALE));
	}

	// --- page size -----------------------------------------------------------

	/**
	 * Override the output size of one page (PDF points). Only meaningful for a
	 * `source` page op; blanks already carry their own size.
	 */
	setPageSize(pageIndex: number, size: [number, number]) {
		const op = this.pageOps[pageIndex];
		if (!op) return;
		op.size = size;
		this.selectedId = null;
	}

	/** Override the output size of every page. */
	setAllPageSizes(size: [number, number]) {
		for (const op of this.pageOps) {
			op.size = [size[0], size[1]];
		}
		this.selectedId = null;
	}

	/** Clear a page's size override, reverting to its source/blank size. */
	clearPageSize(pageIndex: number) {
		const op = this.pageOps[pageIndex];
		if (op && op.kind === 'source') delete op.size;
	}

	// --- outline / bookmarks -------------------------------------------------

	/** Add a top-level bookmark pointing at `page` (0-based output index). */
	addBookmark(title = 'New bookmark', page = 0) {
		this.outline = [...this.outline, { title, page }];
	}

	/** Remove the top-level bookmark at `index` (and its children). */
	removeBookmark(index: number) {
		this.outline = this.outline.filter((_, i) => i !== index);
	}

	/** Move a top-level bookmark up/down among its siblings. */
	moveBookmark(index: number, delta: number) {
		const to = index + delta;
		if (index < 0 || index >= this.outline.length || to < 0 || to >= this.outline.length) return;
		const items = this.outline.slice();
		const [item] = items.splice(index, 1);
		if (!item) return;
		items.splice(to, 0, item);
		this.outline = items;
	}

	/**
	 * Nest the top-level bookmark at `index` under its previous sibling (demote),
	 * making the outline tree one level deeper. No-op for the first item.
	 */
	nestBookmark(index: number) {
		if (index <= 0 || index >= this.outline.length) return;
		const items = this.outline.slice();
		const item = items[index];
		const parent = items[index - 1];
		if (!item || !parent) return;
		parent.children = [...(parent.children ?? []), item];
		items.splice(index, 1);
		this.outline = items;
	}

	// --- raster uploads ------------------------------------------------------

	async readRaster(file: File): Promise<PendingRaster | null> {
		this.errorMessage = null;
		const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
		const isJpg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
		if (!isPng && !isJpg) {
			this.errorMessage = 'Please choose a PNG or JPG image.';
			return null;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			this.errorMessage = `That image is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB).`;
			return null;
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const aspect = await imageAspect(file);
			return { image: bytes, format: isPng ? 'png' : 'jpg', aspect };
		} catch {
			this.errorMessage = 'Could not read that image.';
			return null;
		}
	}

	// --- custom fonts --------------------------------------------------------

	/**
	 * Read a .ttf/.otf file into an {@link EmbeddedFontAsset} (with a size cap) and
	 * register it on {@link embeddedFonts}. Returns the asset, or null on a bad
	 * type / oversize / read error (with {@link errorMessage} set).
	 */
	async readFont(file: File): Promise<EmbeddedFontAsset | null> {
		this.errorMessage = null;
		const name = file.name.toLowerCase();
		const ok = name.endsWith('.ttf') || name.endsWith('.otf');
		if (!ok) {
			this.errorMessage = 'Please choose a .ttf or .otf font file.';
			return null;
		}
		if (file.size > MAX_FONT_BYTES) {
			this.errorMessage = `That font is too large (max ${Math.round(MAX_FONT_BYTES / 1024 / 1024)} MB).`;
			return null;
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const asset: EmbeddedFontAsset = { id: this.nextId('fnt'), name: file.name, bytes };
			this.embeddedFonts = { ...this.embeddedFonts, [asset.id]: asset };
			return asset;
		} catch {
			this.errorMessage = 'Could not read that font.';
			return null;
		}
	}

	/** Upload a custom font and apply it to a text element (sets its `fontId`). */
	async applyCustomFont(file: File, el: TextElement): Promise<void> {
		const asset = await this.readFont(file);
		if (asset) el.fontId = asset.id;
	}

	/** Revert a text element to its standard font (clears `fontId`). */
	clearCustomFont(el: TextElement): void {
		delete el.fontId;
	}

	// --- attachments -----------------------------------------------------------

	/**
	 * Embed a file as a document attachment. Rejects a name already used by
	 * another attachment or already present in the source (the library throws
	 * DuplicateAttachmentError at export otherwise).
	 */
	async addAttachment(file: File): Promise<void> {
		this.errorMessage = null;
		if (file.size > MAX_ATTACHMENT_BYTES) {
			this.errorMessage = `That file is too large (max ${Math.round(
				MAX_ATTACHMENT_BYTES / 1024 / 1024
			)} MB).`;
			return;
		}
		const name = file.name;
		const taken = new Set([...this.attachments.map((a) => a.name), ...this.sourceAttachmentNames]);
		if (taken.has(name)) {
			this.errorMessage = `An attachment named "${name}" already exists.`;
			return;
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const asset: AttachmentInput = {
				id: this.nextId('att'),
				name,
				bytes,
				...(file.type ? { mimeType: file.type } : {})
			};
			this.attachments = [...this.attachments, asset];
		} catch {
			this.errorMessage = 'Could not read that file.';
		}
	}

	/** Remove an attachment by id. Removing a source-origin one routes the export
	 * to the rebuild path (see planExport's attachment-removed guard). */
	removeAttachment(id: string): void {
		this.attachments = this.attachments.filter((a) => a.id !== id);
	}

	// --- export --------------------------------------------------------------

	async export() {
		this.exporting = true;
		this.errorMessage = null;
		try {
			const firstPage = this.pages[0] ?? { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
			// Only ship fonts actually referenced by a text element (unused are harmless,
			// but trimming keeps the payload small).
			const referenced = this.elements
				.filter((e): e is TextElement => e.type === 'text' && typeof e.fontId === 'string')
				.map((e) => e.fontId as string);
			const fonts = Object.values(this.embeddedFonts).filter((f) => referenced.includes(f.id));
			const metadata = this.cleanMetadata();
			const outline = $state.snapshot(this.outline) as OutlineItem[];
			const state: EditState = {
				pageSize: [firstPage.width, firstPage.height],
				elements: $state.snapshot(this.elements) as EditElement[],
				// Multi-source: ship the full sources array when present; the builder
				// treats sources[0] as the primary (back-compat with sourcePdf).
				...(this.sources.length > 0
					? { sources: $state.snapshot(this.sources) as Uint8Array[] }
					: {}),
				...(this.sourceFields.length > 0
					? { sourceFields: $state.snapshot(this.sourceFields) as FieldElement[] }
					: {}),
				...(this.pageOps.length > 0 ? { pageOps: $state.snapshot(this.pageOps) as PageOp[] } : {}),
				...(fonts.length > 0 ? { fonts: $state.snapshot(fonts) as EmbeddedFontAsset[] } : {}),
				...(metadata ? { metadata } : {}),
				...(outline.length > 0 ? { outline } : {}),
				...(this.flatten ? { flatten: true } : {}),
				...(this.optimizeSize && !this.flatten ? { objectStreams: true } : {}),
				...(this.watermark && this.watermark.text.trim().length > 0
					? { watermark: $state.snapshot(this.watermark) as Watermark }
					: {}),
				...(this.attachments.length > 0
					? {
							attachments: $state.snapshot(this.attachments) as AttachmentInput[],
							...(this.sourceAttachmentNames.length > 0
								? { sourceAttachmentNames: [...this.sourceAttachmentNames] }
								: {})
						}
					: {})
			};
			validateExportState(state);
			await checkExportAllowance({ fingerprint: getFingerprint() });

			const { buildPdf, PdfBuildError } = await import('$lib/pdf/build');
			try {
				const bytes = await buildPdf(state);
				downloadPdf(bytes);
			} catch (e) {
				this.errorMessage = exportErrorMessage(e);
				if (!(e instanceof PdfBuildError)) {
					// Genuine bug (not bad input): report metadata only, never bytes.
					const err = e instanceof Error ? e : undefined;
					// Fire-and-forget: telemetry must never surface a network error to
					// the user, so swallow a failed report POST (offline, 5xx, …).
					void reportExportError({
						fingerprint: getFingerprint(),
						name: err?.name ?? 'Error',
						message: err?.message ?? String(e),
						stack: err?.stack,
						pageCount: this.pages.length,
						fieldCount: this.elements.filter((el) => el.type === 'field').length,
						stamping: this.sources.length > 0
					}).catch(() => {});
				}
			}
		} catch (e) {
			// Gate (429) or validation failure — before any local build ran.
			const upsell = parseUpsell(e);
			if (upsell) {
				this.upsell = upsell;
			} else {
				this.errorMessage = exportErrorMessage(e);
			}
		} finally {
			this.exporting = false;
		}
	}

	dismissUpsell() {
		this.upsell = null;
	}

	/**
	 * Scroll the main canvas so page `index` is in view — the left-panel page list
	 * clicks call this to navigate. Matches the `data-editor-page` anchor Canvas
	 * renders per page; guarded so it's a no-op without a DOM (SSR/tests).
	 */
	scrollToPage(index: number) {
		if (typeof document === 'undefined') return;
		const el = document.querySelector(`[data-editor-page="${index}"]`);
		if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	/** Guards {@link warmExportEngine} so only its first call does work. */
	#warmed = false;

	/** Preload the export WASM on idle so the first export is instant. Safe to
	 *  call repeatedly; only the first call does work. */
	warmExportEngine(): void {
		if (this.#warmed) return;
		this.#warmed = true;
		void import('$lib/pdf/build')
			.then((m) => m.initializeWasm())
			.catch(() => {
				// Warming is best-effort; export re-imports and retries on demand.
				this.#warmed = false;
			});
	}

	/**
	 * Snapshot {@link metadata} keeping only non-empty fields, or null when every
	 * field is blank (so the export omits the metadata block entirely).
	 */
	cleanMetadata(): DocumentMetadataInput | null {
		const m = $state.snapshot(this.metadata) as DocumentMetadataInput;
		const out: DocumentMetadataInput = {};
		for (const key of ['title', 'author', 'subject', 'creator', 'producer'] as const) {
			const v = m[key];
			if (typeof v === 'string' && v.length > 0) out[key] = v;
		}
		const keywords = (m.keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 0);
		if (keywords.length > 0) out.keywords = keywords;
		return Object.keys(out).length > 0 ? out : null;
	}
}

/**
 * Build a useful error message for a failed export. Remote-function errors
 * arrive as an HttpError-like object: the server's message is on `.body.message`
 * (e.g. a 422 "this PDF is encrypted"), with a numeric `.status`. Surface that
 * instead of a generic retry prompt so the user knows what actually went wrong.
 */
function exportErrorMessage(e: unknown): string {
	const err = e as { status?: number; body?: { message?: string }; message?: string };
	const detail = err?.body?.message ?? err?.message;
	if (detail && detail.trim().length > 0) {
		return err?.status ? `Export failed (${err.status}): ${detail}` : `Export failed: ${detail}`;
	}
	return 'Export failed. Please try again.';
}

/**
 * Default vertical stack of `count` radio-button positions (top-left PDF points),
 * starting at `x`/`y` and stepping down by `size + 6`. Mirrors the export layout
 * so a never-dragged radio looks the same in the editor and the output PDF.
 */
function radioStack(x: number, y: number, size: number, count: number): { x: number; y: number }[] {
	return Array.from({ length: count }, (_, i) => ({ x, y: y + i * (size + 6) }));
}

/** Top-left bounding box (x/y = min corner) of a list of points. */
function boundingBox(points: { x: number; y: number }[]): { x: number; y: number } {
	if (points.length === 0) return { x: 0, y: 0 };
	let minX = Infinity;
	let minY = Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
	}
	return { x: minX, y: minY };
}

function imageAspect(file: File): Promise<number> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('image decode failed'));
		};
		img.src = url;
	});
}

function downloadPdf(bytes: Uint8Array) {
	// Copy into a plain ArrayBuffer so the Blob part type is satisfied (the wire
	// value may be backed by a non-ArrayBuffer buffer).
	const buf = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buf).set(bytes);
	const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = 'document.pdf';
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Recognize the rate-limit (429) payload the export command serializes.
 *
 * A remote-function `error(429, body)` reaches the client as an HttpError-like
 * object: the JSON we sent is on `.body.message`, with `.status === 429`. Fall
 * back to a plain `.message` for safety.
 */
function parseUpsell(e: unknown): UpsellInfo | null {
	const err = e as { status?: number; body?: { message?: string }; message?: string };
	const raw = err?.body?.message ?? err?.message;

	if (raw) {
		try {
			const body = JSON.parse(raw) as { reason?: string } & UpsellInfo;
			if (body.reason === 'rate_limited') {
				return {
					...(body.limit !== undefined ? { limit: body.limit } : {}),
					...(body.window !== undefined ? { window: body.window } : {}),
					...(body.retryAt !== undefined ? { retryAt: body.retryAt } : {}),
					...(body.upgradeUrl !== undefined ? { upgradeUrl: body.upgradeUrl } : {})
				};
			}
		} catch {
			// not a JSON payload; fall through to the status check
		}
	}

	// Rate-limited but body wasn't the expected JSON: still show the upsell.
	return err?.status === 429 ? {} : null;
}
