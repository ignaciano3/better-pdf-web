import type { EditElement, EditState, ImageElement, SignatureElement } from '$lib/pdf/types';
import { renderSourcePdf, type RenderedPage, PdfRenderError } from '$lib/pdf/render';
import { exportPdf } from './export.remote';
import {
	DEFAULT_PAGE,
	SCALE,
	MAX_PDF_BYTES,
	MAX_IMAGE_BYTES,
	SIGNATURE_DEFAULT_WIDTH,
	IMAGE_DEFAULT_WIDTH,
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
	pages = $state<PageInfo[]>([{ width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] }]);
	rendered = $state<RenderedPage[]>([]);
	sourceBytes = $state<Uint8Array | null>(null);

	pendingSignature = $state<PendingRaster | null>(null);
	pendingImage = $state<PendingRaster | null>(null);

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

	elementsForPage(pageIndex: number): EditElement[] {
		return this.elements.filter((e) => (e.page ?? 0) === pageIndex);
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

	/** Handle a click on the bare page background at canvas px coords. */
	placeAtClient(clientX: number, clientY: number, pageEl: HTMLElement, pageIndex: number) {
		const rect = pageEl.getBoundingClientRect();
		const x = (clientX - rect.left) / SCALE;
		const y = (clientY - rect.top) / SCALE;
		if (this.pendingSignature) return this.placeSignatureAt(x, y, pageIndex);
		if (this.pendingImage) return this.placeImageAt(x, y, pageIndex);
		this.addTextAt(x, y, pageIndex);
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

	startResize(event: PointerEvent, el: SignatureElement | ImageElement) {
		event.stopPropagation();
		event.preventDefault();
		this.selectedId = el.id;
		const startX = event.clientX;
		const startWidth = el.width;
		const aspect = el.width / el.height;

		const move = (e: PointerEvent) => {
			el.width = Math.max(20, startWidth + (e.clientX - startX) / SCALE);
			el.height = el.width / aspect;
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
			this.pages = result.map((p) => ({ width: p.width, height: p.height }));
			this.sourceBytes = exportCopy;
			this.elements = [];
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

	clearSource() {
		this.sourceBytes = null;
		this.rendered = [];
		this.pages = [{ width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] }];
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
				...(this.sourceBytes ? { sourcePdf: this.sourceBytes } : {})
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

/** Recognize the rate-limit (429) payload the export command serializes. */
function parseUpsell(e: unknown): UpsellInfo | null {
	if (!(e instanceof Error)) return null;
	try {
		const body = JSON.parse(e.message) as { reason?: string } & UpsellInfo;
		if (body.reason === 'rate_limited') {
			return {
				...(body.limit !== undefined ? { limit: body.limit } : {}),
				...(body.window !== undefined ? { window: body.window } : {}),
				...(body.upgradeUrl !== undefined ? { upgradeUrl: body.upgradeUrl } : {})
			};
		}
	} catch {
		// not a JSON rate-limit payload
	}
	return null;
}
