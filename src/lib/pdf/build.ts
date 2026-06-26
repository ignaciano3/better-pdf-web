import { PdfDocument, PdfError, rgb } from '@ignaciano3/better-pdf';
import type { Color, PdfFont } from '@ignaciano3/better-pdf/generate';
import { StandardFonts } from '@ignaciano3/better-pdf';
import type { FormBuilder } from '@ignaciano3/better-pdf/generate';
import type {
	DocumentMetadataInput,
	EditElement,
	EditState,
	EmbeddedFontAsset,
	FieldElement,
	OutlineItem,
	PageOp
} from './types';
import { renderElement } from './renderers';
import { topLeftToPdfY } from './coords';

/**
 * Error thrown when a source PDF cannot be loaded or stamped. Carries a
 * human-friendly message so the export seam can surface it without leaking
 * core internals or crashing.
 */
export class PdfBuildError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'PdfBuildError';
	}
}

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

/**
 * Finalize editor state into PDF bytes using better-pdf.
 *
 * The export is always a **rebuild** (design decision D3): a fresh document is
 * created, source pages are embedded as backgrounds via `embedPdfPage` +
 * `drawPage`, stamps (text/image/shape/signature) are drawn through the renderer
 * registry, and every {@link FieldElement} is re-authored as a real AcroForm
 * widget via `createForm()`. This is required because `createForm()` throws on a
 * `load()`ed document, so fields can only be added to a freshly `create()`d one.
 *
 * Verified (spike): `embedPdfPage` embeds page *content* only — source AcroForm
 * widgets do NOT ride along — so old widgets disappear cleanly and ours are the
 * only fields in the output. Re-uploading the export re-detects them, so fields
 * round-trip.
 *
 * When there is no source PDF and no fields, a single fresh page is created
 * (blank mode). Runs server-side (Node/Bun) where the wasm core self-initializes
 * on import.
 */
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

/**
 * Unify the legacy single {@link EditState.sourcePdf} field with the
 * multi-source {@link EditState.sources} array. `sources` wins when present;
 * otherwise the single `sourcePdf` becomes `sources[0]`.
 */
function resolveSources(state: EditState): Uint8Array[] {
	if (state.sources && state.sources.length > 0) return state.sources;
	if (state.sourcePdf && state.sourcePdf.byteLength > 0) return [state.sourcePdf];
	return [];
}

/** Apply document metadata + a fresh modification date, then the outline. */
function applyDocumentProps(
	doc: PdfDocument,
	metadata: DocumentMetadataInput | undefined,
	outline: OutlineItem[] | undefined,
	pageCount: number
): void {
	if (metadata) {
		if (metadata.title !== undefined) doc.setTitle(metadata.title);
		if (metadata.author !== undefined) doc.setAuthor(metadata.author);
		if (metadata.subject !== undefined) doc.setSubject(metadata.subject);
		if (metadata.keywords !== undefined) doc.setKeywords(metadata.keywords);
		if (metadata.creator !== undefined) doc.setCreator(metadata.creator);
		if (metadata.producer !== undefined) doc.setProducer(metadata.producer);
	}
	// Always stamp a modification date on export (server-side; new Date() is fine).
	doc.setModificationDate(new Date());

	if (outline && outline.length > 0) {
		const clamped = clampOutline(outline, pageCount);
		if (clamped.length > 0) doc.setOutline(clamped);
	}
}

/**
 * Drop outline entries whose page index is out of range, recursively. Keeps the
 * export robust against a bookmark pointing at a page that was later removed.
 */
function clampOutline(items: OutlineItem[], pageCount: number): OutlineItem[] {
	const out: OutlineItem[] = [];
	for (const item of items) {
		if (!Number.isInteger(item.page) || item.page < 0 || item.page >= pageCount) continue;
		const children = item.children ? clampOutline(item.children, pageCount) : undefined;
		out.push({ title: item.title, page: item.page, ...(children ? { children } : {}) });
	}
	return out;
}

/** RGB 0..1 helper → lib Color. */
function toColor(c: { r: number; g: number; b: number }): Color {
	return rgb(c.r, c.g, c.b);
}

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
	const fontName = (wm.font ?? 'Helvetica-Bold') as StandardFonts;
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

/**
 * Embed each font asset once, returning a `Record<id, PdfFont>` for renderers.
 * A single asset that fails to embed (corrupt / unsupported font program) is
 * skipped — text referencing it falls back to its standard font — rather than
 * failing the whole export.
 */
async function embedFonts(
	doc: PdfDocument,
	assets: readonly EmbeddedFontAsset[] | undefined
): Promise<Record<string, PdfFont>> {
	const fonts: Record<string, PdfFont> = {};
	if (!assets) return fonts;
	for (const asset of assets) {
		if (!asset || !(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength === 0) continue;
		try {
			fonts[asset.id] = await doc.embedFont(asset.bytes);
		} catch {
			// Skip this font; referencing text falls back to its standard font.
		}
	}
	return fonts;
}

/** Decode a `data:image/...;base64,...` URL to raw bytes, or null if not one. */
function dataUrlToBytes(value: string | undefined): Uint8Array | null {
	if (!value || !value.startsWith('data:')) return null;
	const comma = value.indexOf(',');
	if (comma === -1) return null;
	const meta = value.slice(5, comma);
	const data = value.slice(comma + 1);
	if (!meta.includes('base64')) return null;
	try {
		const bin = atob(data);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

/** Build a fresh single (or page-ops driven) blank document with stamps + fields. */
async function buildBlankRebuild(state: EditState): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	const pageHeights: number[] = [];
	const pageWidths: number[] = [];

	if (state.pageOps && state.pageOps.length > 0) {
		for (const op of state.pageOps) {
			const size = op.kind === 'blank' ? op.size : state.pageSize;
			const rotated = normalizeRotation(op.rotation) % 180 !== 0;
			const [w, h] = rotated ? [size[1], size[0]] : size;
			const page = doc.addPage([w, h]);
			if (op.rotation) page.setRotation(normalizeRotation(op.rotation));
			pageHeights.push(h);
			pageWidths.push(w);
		}
	} else {
		doc.addPage(state.pageSize);
		pageHeights.push(state.pageSize[1]);
		pageWidths.push(state.pageSize[0]);
	}

	const fonts = await embedFonts(doc, state.fonts);
	await stampAndAuthor(doc, state.elements, pageHeights, fonts);
	if (state.watermark) drawWatermark(doc, pageWidths, pageHeights, state.watermark);
	applyDocumentProps(doc, state.metadata, state.outline, pageHeights.length);
	return doc.save();
}

/** Build a fresh document from one or more embedded source PDFs with stamps + fields (D3). */
async function buildSourceRebuild(state: EditState, sources: Uint8Array[]): Promise<Uint8Array> {
	try {
		const doc = await PdfDocument.create();
		const pageHeights: number[] = [];
		const pageWidths: number[] = [];

		// One output page per pageOp (order / blank / rotation), or 1:1 with the
		// pages of the primary source when there are no page ops.
		const ops: PageOp[] = state.pageOps && state.pageOps.length > 0 ? [...state.pageOps] : [];
		if (ops.length === 0) {
			const primary = sources[0] as Uint8Array;
			const src = await PdfDocument.load(primary);
			const count = src.getPageCount();
			for (let i = 0; i < count; i++)
				ops.push({ kind: 'source', sourceIndex: i, rotation: 0, docIndex: 0 });
		}

		for (const op of ops) {
			if (op.kind === 'source') {
				const docIndex = op.docIndex ?? 0;
				const sourceBytes = sources[docIndex];
				if (!sourceBytes) {
					throw new PdfBuildError('Referenced a source document that was not provided.');
				}
				const embedded = await doc.embedPdfPage(sourceBytes, op.sourceIndex);
				const rotated = normalizeRotation(op.rotation) % 180 !== 0;
				// Output content box: the override size when set, else the source size.
				const [boxW, boxH] = op.size ? op.size : [embedded.width, embedded.height];
				const [w, h] = rotated ? [boxH, boxW] : [boxW, boxH];
				const page = doc.addPage([w, h]);
				// Draw the embedded source content scaled to fill the (un-rotated)
				// content box. Rotation is applied to the page itself.
				page.drawPage(embedded, { x: 0, y: 0, width: boxW, height: boxH });
				if (op.rotation) page.setRotation(normalizeRotation(op.rotation));
				// Field/stamp coords are authored against the un-rotated content box.
				pageHeights.push(boxH);
				pageWidths.push(boxW);
			} else {
				const rotated = normalizeRotation(op.rotation) % 180 !== 0;
				const [w, h] = rotated ? [op.size[1], op.size[0]] : op.size;
				const page = doc.addPage([w, h]);
				if (op.rotation) page.setRotation(normalizeRotation(op.rotation));
				pageHeights.push(op.size[1]);
				pageWidths.push(op.size[0]);
			}
		}

		const fonts = await embedFonts(doc, state.fonts);
		await stampAndAuthor(doc, state.elements, pageHeights, fonts);
		if (state.watermark) drawWatermark(doc, pageWidths, pageHeights, state.watermark);
		applyDocumentProps(doc, state.metadata, state.outline, pageHeights.length);
		return await doc.save();
	} catch (cause) {
		if (cause instanceof PdfBuildError) throw cause;
		const detail = cause instanceof PdfError ? cause.message : '';
		throw new PdfBuildError(
			detail
				? `Could not process the uploaded PDF: ${detail}`
				: 'Could not process the uploaded file. It may be corrupt, encrypted, or not a valid PDF.',
			{ cause }
		);
	}
}

/**
 * Stamp non-field elements onto their pages (via the renderer registry), draw
 * signature-field PNGs at their rect, then author every {@link FieldElement} as
 * a real AcroForm widget. `pageHeights[i]` is the content height of output page
 * `i`, used for the top-left → bottom-left Y flip.
 */
async function stampAndAuthor(
	doc: PdfDocument,
	elements: readonly EditElement[],
	pageHeights: number[],
	fonts: Record<string, PdfFont>
): Promise<void> {
	const pageCount = pageHeights.length;
	const fields: FieldElement[] = [];

	for (const element of elements) {
		const pageIndex = element.page ?? 0;
		if (pageIndex < 0 || pageIndex >= pageCount) continue;
		if (element.type === 'field') {
			fields.push(element);
			continue;
		}
		const page = doc.getPage(pageIndex);
		await renderElement(
			{ doc, page, pageHeight: pageHeights[pageIndex] as number, fonts },
			element
		);
	}

	// Draw signature-field PNGs (drawn/uploaded) into their rect so they show even
	// before the field is signed in a viewer. The interactive signature widget is
	// still authored below so the field round-trips.
	for (const f of fields) {
		if (f.field !== 'signature') continue;
		const bytes = dataUrlToBytes(f.value);
		if (!bytes) continue;
		const pageIndex = f.page ?? 0;
		if (pageIndex < 0 || pageIndex >= pageCount) continue;
		const page = doc.getPage(pageIndex);
		try {
			const img = await doc.embedPng(bytes);
			page.drawImage(img, {
				x: f.x,
				y: topLeftToPdfY(f.y, f.height, pageHeights[pageIndex] as number),
				width: f.width,
				height: f.height
			});
		} catch {
			// Undecodable signature PNG — skip drawing; the field is still authored.
		}
	}

	if (fields.length > 0) {
		const form = doc.createForm();
		for (const f of fields) {
			authorField(form, f, pageHeights);
		}
	}
}

/** Author one {@link FieldElement} onto the form builder at its position. */
function authorField(form: FormBuilder, f: FieldElement, pageHeights: number[]): void {
	const page = f.page ?? 0;
	const pageHeight = pageHeights[page] ?? 0;
	const y = topLeftToPdfY(f.y, f.height, pageHeight);
	const base = {
		page,
		x: f.x,
		y,
		...(f.required ? { required: true } : {}),
		...(f.readOnly ? { readOnly: true } : {}),
		...(f.tooltip ? { tooltip: f.tooltip } : {}),
		...(f.border
			? {
					border: {
						color: toColor(f.border.color),
						...(f.border.width !== undefined ? { width: f.border.width } : {})
					}
				}
			: {}),
		...(f.background ? { background: toColor(f.background) } : {}),
		...(f.textColor ? { textColor: toColor(f.textColor) } : {})
	};

	switch (f.field) {
		case 'text':
			form.addTextField(f.name, {
				...base,
				width: f.width,
				height: f.height,
				...(f.value ? { value: f.value } : {}),
				...(f.maxLength !== undefined ? { maxLength: f.maxLength } : {}),
				...(f.multiline ? { multiline: true } : {})
			});
			break;
		case 'checkbox':
			form.addCheckBox(f.name, {
				...base,
				size: Math.min(f.width, f.height),
				...(f.value ? { checked: true } : {})
			});
			break;
		case 'radio': {
			const options = f.options && f.options.length > 0 ? f.options : ['Option 1'];
			const size = Math.min(f.width, f.height);
			// Each option is an independently placed widget: prefer its radioLayout
			// position (top-left points → PDF Y), else fall back to a vertical stack
			// below the anchor (#3).
			form.addRadioGroup(f.name, {
				...(f.required ? { required: true } : {}),
				...(f.readOnly ? { readOnly: true } : {}),
				...(f.tooltip ? { tooltip: f.tooltip } : {}),
				...(f.border
					? {
							border: {
								color: toColor(f.border.color),
								...(f.border.width !== undefined ? { width: f.border.width } : {})
							}
						}
					: {}),
				...(f.background ? { background: toColor(f.background) } : {}),
				...(f.value ? { selected: f.value } : {}),
				options: options.map((value, i) => {
					const slot = f.radioLayout?.[i];
					const ox = slot?.x ?? f.x;
					const oy = slot ? topLeftToPdfY(slot.y, size, pageHeight) : y - i * (size + 6);
					return { value, page, x: ox, y: oy, size };
				})
			});
			break;
		}
		case 'dropdown':
		case 'combo':
			// Both author via addDropdown; `editable` (combo box Edit flag) is set
			// only for `combo` so the user can type a value outside `options`.
			form.addDropdown(f.name, {
				...base,
				width: f.width,
				height: f.height,
				options: f.options ?? [],
				...(f.field === 'combo' ? { editable: true } : {}),
				...(f.value ? { selected: f.value } : {})
			});
			break;
		case 'listbox':
			form.addListBox(f.name, {
				...base,
				width: f.width,
				height: f.height,
				options: f.options ?? [],
				...(f.value ? { selected: f.value } : {})
			});
			break;
		case 'signature':
			form.addSignatureField(f.name, {
				...base,
				width: f.width,
				height: f.height
			});
			break;
	}
}

/** Normalise an arbitrary degree value to one of 0/90/180/270. */
function normalizeRotation(degrees: number): number {
	return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}
