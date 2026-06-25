import type {
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
	TextElement
} from '$lib/pdf/types';
import { renderSourcePdf, type RenderedPage, PdfRenderError } from '$lib/pdf/render';
import { exportPdf } from './export.remote';
import { extractFields } from './extractFields.remote';
import {
	DEFAULT_PAGE,
	SCALE,
	MAX_PDF_BYTES,
	MAX_IMAGE_BYTES,
	MAX_FONT_BYTES,
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
	upgradeUrl?: string;
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
	/** True while the document-properties modal is open. */
	docPropsModalOpen = $state(false);
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

	#nextId = 0;
	/** Object URLs for raster previews, cached per element id. Not reactive. */
	#rasterUrls: Record<string, string> = {};

	/**
	 * Custom fonts uploaded in this session, keyed by asset id. A Record (not a
	 * Map) so it works in reactive Svelte state under the project's eslint rules.
	 * Referenced by {@link TextElement.fontId}; included in the export state.
	 */
	embeddedFonts = $state<Record<string, EmbeddedFontAsset>>({});

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

	/** Insert a blank page after `afterIndex` (−1 inserts at the front). */
	insertBlankPage(afterIndex: number) {
		// Match the dominant page size (first source page) so blanks fit in.
		const first = this.pages[0] ?? { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
		const blank: PageOp = { kind: 'blank', size: [first.width, first.height], rotation: 0 };
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
			.map((e) => (e as FieldElement).name);
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
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	/** Handle a click on the bare page background at canvas px coords. Only an
	 * active draw or field tool creates; shape kinds are drawn by drag, not click. */
	placeAtClient(clientX: number, clientY: number, pageEl: HTMLElement, pageIndex: number) {
		const rect = pageEl.getBoundingClientRect();
		const x = (clientX - rect.left) / this.cssScale;
		const y = (clientY - rect.top) / this.cssScale;

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
		event.preventDefault();
		pageEl.setPointerCapture(event.pointerId);
		const rect = pageEl.getBoundingClientRect();
		const startX = (event.clientX - rect.left) / this.cssScale;
		const startY = (event.clientY - rect.top) / this.cssScale;

		const stroke = $state.snapshot(this.shapeStroke);
		const el: ShapeElement = {
			type: 'shape',
			id: this.nextId('sh'),
			shape: kind,
			x: startX,
			y: startY,
			width: 0,
			height: 0,
			page: pageIndex,
			strokeColor: stroke,
			strokeWidth: SHAPE_DEFAULT_STROKE_WIDTH
		};
		this.add(el);
		// Use the reactive proxy version so mutations trigger re-renders.
		const live = this.elements[this.elements.length - 1] as ShapeElement;

		const move = (e: PointerEvent) => {
			const curX = (e.clientX - rect.left) / this.cssScale;
			const curY = (e.clientY - rect.top) / this.cssScale;
			live.x = Math.min(startX, curX);
			live.y = Math.min(startY, curY);
			live.width = Math.abs(curX - startX);
			live.height = Math.abs(curY - startY);
			// A line keeps its drag direction: anti-diagonal when X and Y move in
			// opposite directions (top-right → bottom-left or bottom-left → top-right).
			if (live.shape === 'line') live.antidiagonal = (curX - startX) * (curY - startY) < 0;
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			// A stray click with no real drag still yields a visible default shape.
			if (live.width < SHAPE_MIN_SIZE) live.width = SHAPE_MIN_SIZE * 4;
			if (live.shape !== 'line' && live.height < SHAPE_MIN_SIZE) live.height = SHAPE_MIN_SIZE * 4;
			// One-shot tool: return to select after drawing.
			this.suppressNextClick = true;
			this.resetTool();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		return true;
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
		event.preventDefault();
		pageEl.setPointerCapture(event.pointerId);
		const rect = pageEl.getBoundingClientRect();
		const at = (e: PointerEvent) => ({
			x: (e.clientX - rect.left) / this.cssScale,
			y: (e.clientY - rect.top) / this.cssScale
		});
		const start = at(event);
		const stroke = $state.snapshot(this.shapeStroke);
		const el: PathElement = {
			type: 'path',
			id: this.nextId('pa'),
			x: start.x,
			y: start.y,
			page: pageIndex,
			points: [start],
			closed: false,
			strokeColor: stroke,
			strokeWidth: VECTOR_DEFAULT_STROKE_WIDTH
		};
		this.add(el);
		// Use the reactive proxy version so mutations trigger re-renders.
		const live = this.elements[this.elements.length - 1] as PathElement;

		const move = (e: PointerEvent) => {
			const p = at(e);
			// Skip near-duplicate samples to keep the point list manageable.
			const last = live.points[live.points.length - 1];
			if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1) return;
			live.points = [...live.points, p];
			const box = boundingBox(live.points);
			live.x = box.x;
			live.y = box.y;
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			// Discard single-point taps that produce no visible stroke.
			if (live.points.length < 2) {
				this.elements = this.elements.filter((e) => e.id !== live.id);
				this.selectedId = null;
			}
			this.suppressNextClick = true;
			this.resetTool();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		return true;
	}

	/**
	 * Begin a link rect: press one corner, drag to size, release commits a
	 * {@link LinkElement} (default empty `url`) and resets to select. The floating
	 * toolbar then edits the target. Returns false when the link tool isn't active.
	 */
	beginLinkDraw(event: PointerEvent, pageEl: HTMLElement, pageIndex: number): boolean {
		if (!(this.tool.type === 'draw' && this.tool.kind === 'link')) return false;
		event.preventDefault();
		pageEl.setPointerCapture(event.pointerId);
		const rect = pageEl.getBoundingClientRect();
		const startX = (event.clientX - rect.left) / this.cssScale;
		const startY = (event.clientY - rect.top) / this.cssScale;
		const el: LinkElement = {
			type: 'link',
			id: this.nextId('ln'),
			x: startX,
			y: startY,
			width: 0,
			height: 0,
			page: pageIndex,
			url: ''
		};
		this.add(el);
		// Use the reactive proxy version so mutations trigger re-renders.
		const live = this.elements[this.elements.length - 1] as LinkElement;

		const move = (e: PointerEvent) => {
			const curX = (e.clientX - rect.left) / this.cssScale;
			const curY = (e.clientY - rect.top) / this.cssScale;
			live.x = Math.min(startX, curX);
			live.y = Math.min(startY, curY);
			live.width = Math.abs(curX - startX);
			live.height = Math.abs(curY - startY);
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			if (live.width < SHAPE_MIN_SIZE) live.width = LINK_DEFAULT_SIZE.width;
			if (live.height < SHAPE_MIN_SIZE) live.height = LINK_DEFAULT_SIZE.height;
			this.suppressNextClick = true;
			this.resetTool();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		return true;
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
		let dragging = false;

		const move = (e: PointerEvent) => {
			// Threshold so a plain click still places the text caret for editing.
			if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
			dragging = true;
			const dx = (e.clientX - startX) / this.cssScale;
			const dy = (e.clientY - startY) / this.cssScale;
			el.x = originX + dx;
			el.y = originY + dy;
			if (originPoints && (el.type === 'path' || el.type === 'polygon')) {
				el.points = originPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
			}
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
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
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
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
			const bytes = new Uint8Array(await file.arrayBuffer());
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
			// Detect AcroForm fields (D1, server-side). Failures are swallowed: the
			// editor still opens for stamping with no fields surfaced.
			let detected: FieldElement[] = [];
			try {
				const res = await extractFields({ bytes: exportCopy.slice() });
				detected = res.fields as FieldElement[];
			} catch {
				detected = [];
			}
			this.elements = detected;
		} catch (e) {
			this.errorMessage =
				e instanceof PdfRenderError
					? e.message
					: 'Could not open that PDF. It may be corrupt or unsupported.';
		} finally {
			this.loadingPdf = false;
		}
	}

	clearSource() {
		this.sources = [];
		this.renderedByDoc = [];
		this.pageOps = [];
		this.elements = [];
		this.selectedId = null;
		this.errorMessage = null;
		this.pendingSignature = null;
		this.pendingImage = null;
		this.polygonDraftId = null;
		this.metadata = {};
		this.outline = [];
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
			const bytes = new Uint8Array(await file.arrayBuffer());
			const exportCopy = bytes.slice();
			const result = await renderSourcePdf(bytes, SCALE);
			const docIndex = this.renderedByDoc.length;
			this.renderedByDoc = [...this.renderedByDoc, result];
			this.sources = [...this.sources, exportCopy];
			// If the editor was blank (no source pages), drop the implicit blank page
			// by starting page ops fresh; otherwise append after the existing pages.
			const appended: PageOp[] = result.map((_, i) => ({
				kind: 'source',
				sourceIndex: i,
				rotation: 0,
				docIndex
			}));
			this.pageOps = [...this.pageOps, ...appended];
			this.selectedId = null;
		} catch (e) {
			this.errorMessage =
				e instanceof PdfRenderError
					? e.message
					: 'Could not open that PDF. It may be corrupt or unsupported.';
		} finally {
			this.loadingPdf = false;
		}
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
				...(this.pageOps.length > 0 ? { pageOps: $state.snapshot(this.pageOps) as PageOp[] } : {}),
				...(fonts.length > 0 ? { fonts: $state.snapshot(fonts) as EmbeddedFontAsset[] } : {}),
				...(metadata ? { metadata } : {}),
				...(outline.length > 0 ? { outline } : {})
			};
			const bytes = await exportPdf({ state, fingerprint: getFingerprint() });
			downloadPdf(bytes);
		} catch (e) {
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
