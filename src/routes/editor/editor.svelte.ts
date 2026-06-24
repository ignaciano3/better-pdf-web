import type {
	EditElement,
	EditState,
	FieldElement,
	FieldKind,
	ImageElement,
	PageOp,
	ShapeElement,
	SignatureElement
} from '$lib/pdf/types';
import { renderSourcePdf, type RenderedPage, PdfRenderError } from '$lib/pdf/render';
import { exportPdf } from './export.remote';
import { extractFields } from './extractFields.remote';
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
	FIELD_DEFAULT_SIZE,
	SELECT_TOOL,
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
	 * Original source-page renders, indexed by their **original** zero-based page
	 * in the loaded PDF. Stays fixed after load; page operations reorder via
	 * {@link pageOps} (which carries `sourceIndex`) rather than by mutating this.
	 * Empty in blank mode.
	 */
	rendered = $state<RenderedPage[]>([]);
	sourceBytes = $state<Uint8Array | null>(null);
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
					const [w, h] =
						op.kind === 'source'
							? [
									this.rendered[op.sourceIndex]?.width ?? DEFAULT_PAGE[0],
									this.rendered[op.sourceIndex]?.height ?? DEFAULT_PAGE[1]
								]
							: op.size;
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

	/** True while the field-properties modal is open for the selected field. */
	fieldModalOpen = $state(false);

	exporting = $state(false);
	loadingPdf = $state(false);
	errorMessage = $state<string | null>(null);
	/** Non-null when the last export was rate-limited; the upsell modal reads it. */
	upsell = $state<UpsellInfo | null>(null);

	#nextId = 0;
	/** Object URLs for raster previews, cached per element id. Not reactive. */
	#rasterUrls: Record<string, string> = {};

	selected = $derived(this.elements.find((e) => e.id === this.selectedId) ?? null);
	selectedText = $derived(this.selected?.type === 'text' ? this.selected : null);
	selectedShape = $derived(this.selected?.type === 'shape' ? this.selected : null);
	selectedField = $derived(this.selected?.type === 'field' ? this.selected : null);

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
		return this.rendered[op.sourceIndex] ?? null;
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
		this.add({
			type: 'text',
			id: this.nextId('t'),
			text: 'New text',
			x,
			y,
			size: 16,
			page: pageIndex
		});
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
			...(kind === 'dropdown' || kind === 'combo' || kind === 'listbox' || kind === 'radio'
				? { options: ['Option 1', 'Option 2'] }
				: {})
		};
		this.add(el);
	}

	/** Handle a click on the bare page background at canvas px coords. Only an
	 * active draw or field tool creates; shape kinds are drawn by drag, not click. */
	placeAtClient(clientX: number, clientY: number, pageEl: HTMLElement, pageIndex: number) {
		const rect = pageEl.getBoundingClientRect();
		const x = (clientX - rect.left) / SCALE;
		const y = (clientY - rect.top) / SCALE;

		if (this.tool.type === 'field') {
			this.placeFieldAt(this.tool.kind, x, y, pageIndex);
			this.resetTool();
			return;
		}

		if (this.tool.type !== 'draw') return;
		const kind = this.tool.kind;
		if (kind === 'line' || kind === 'rectangle' || kind === 'ellipse') return;

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
		const rect = pageEl.getBoundingClientRect();
		const startX = (event.clientX - rect.left) / SCALE;
		const startY = (event.clientY - rect.top) / SCALE;

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

		const move = (e: PointerEvent) => {
			const curX = (e.clientX - rect.left) / SCALE;
			const curY = (e.clientY - rect.top) / SCALE;
			el.x = Math.min(startX, curX);
			el.y = Math.min(startY, curY);
			el.width = Math.abs(curX - startX);
			el.height = Math.abs(curY - startY);
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			// A stray click with no real drag still yields a visible default shape.
			if (el.width < SHAPE_MIN_SIZE) el.width = SHAPE_MIN_SIZE * 4;
			if (el.shape !== 'line' && el.height < SHAPE_MIN_SIZE) el.height = SHAPE_MIN_SIZE * 4;
			// One-shot tool: return to select after drawing.
			this.resetTool();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		return true;
	}

	// --- drag / resize -------------------------------------------------------

	startDrag(event: PointerEvent, el: EditElement) {
		this.selectedId = el.id;
		const startX = event.clientX;
		const startY = event.clientY;
		const originX = el.x;
		const originY = el.y;
		let dragging = false;

		const move = (e: PointerEvent) => {
			// Threshold so a plain click still places the text caret for editing.
			if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
			dragging = true;
			el.x = originX + (e.clientX - startX) / SCALE;
			el.y = originY + (e.clientY - startY) / SCALE;
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
		el: SignatureElement | ImageElement | ShapeElement | FieldElement
	) {
		event.stopPropagation();
		event.preventDefault();
		this.selectedId = el.id;
		const startX = event.clientX;
		const startY = event.clientY;
		const startWidth = el.width;
		const startHeight = el.height;
		// Rasters resize about their aspect ratio; shapes/fields resize freely.
		const free = el.type === 'shape' || el.type === 'field';
		const aspect = el.width / el.height;

		const minSide = free ? SHAPE_MIN_SIZE : 20;
		const move = (e: PointerEvent) => {
			el.width = Math.max(minSide, startWidth + (e.clientX - startX) / SCALE);
			if (free) {
				el.height = Math.max(minSide, startHeight + (e.clientY - startY) / SCALE);
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
			this.rendered = result;
			// One source-page op per page, in original order, unrotated.
			this.pageOps = result.map((_, i) => ({ kind: 'source', sourceIndex: i, rotation: 0 }));
			this.sourceBytes = exportCopy;
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
		this.sourceBytes = null;
		this.rendered = [];
		this.pageOps = [];
		this.elements = [];
		this.selectedId = null;
		this.errorMessage = null;
		this.pendingSignature = null;
		this.pendingImage = null;
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

	// --- export --------------------------------------------------------------

	async export() {
		this.exporting = true;
		this.errorMessage = null;
		try {
			const firstPage = this.pages[0] ?? { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
			const state: EditState = {
				pageSize: [firstPage.width, firstPage.height],
				elements: $state.snapshot(this.elements) as EditElement[],
				...(this.sourceBytes ? { sourcePdf: this.sourceBytes } : {}),
				...(this.pageOps.length > 0 ? { pageOps: $state.snapshot(this.pageOps) as PageOp[] } : {})
			};
			const bytes = await exportPdf({ state, fingerprint: getFingerprint() });
			downloadPdf(bytes);
		} catch (e) {
			const upsell = parseUpsell(e);
			if (upsell) {
				this.upsell = upsell;
			} else {
				this.errorMessage = e instanceof Error ? e.message : 'Export failed. Please try again.';
			}
		} finally {
			this.exporting = false;
		}
	}

	dismissUpsell() {
		this.upsell = null;
	}
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
