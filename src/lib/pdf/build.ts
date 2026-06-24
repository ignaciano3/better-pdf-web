import { PdfDocument, PdfError, rgb } from '@ignaciano3/better-pdf';
import type { Color, PdfFont } from '@ignaciano3/better-pdf/generate';
import type { FormBuilder } from '@ignaciano3/better-pdf/generate';
import type { EditElement, EditState, EmbeddedFontAsset, FieldElement, PageOp } from './types';
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
	const hasSource = !!(state.sourcePdf && state.sourcePdf.byteLength > 0);
	if (!hasSource) {
		return buildBlankRebuild(state);
	}
	return buildSourceRebuild(state);
}

/** RGB 0..1 helper → lib Color. */
function toColor(c: { r: number; g: number; b: number }): Color {
	return rgb(c.r, c.g, c.b);
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

	if (state.pageOps && state.pageOps.length > 0) {
		for (const op of state.pageOps) {
			const size = op.kind === 'blank' ? op.size : state.pageSize;
			const rotated = normalizeRotation(op.rotation) % 180 !== 0;
			const [w, h] = rotated ? [size[1], size[0]] : size;
			const page = doc.addPage([w, h]);
			if (op.rotation) page.setRotation(normalizeRotation(op.rotation));
			pageHeights.push(h);
		}
	} else {
		doc.addPage(state.pageSize);
		pageHeights.push(state.pageSize[1]);
	}

	const fonts = await embedFonts(doc, state.fonts);
	await stampAndAuthor(doc, state.elements, pageHeights, fonts);
	return doc.save();
}

/** Build a fresh document from an embedded source PDF with stamps + fields (D3). */
async function buildSourceRebuild(state: EditState): Promise<Uint8Array> {
	const sourcePdf = state.sourcePdf as Uint8Array;
	try {
		const doc = await PdfDocument.create();
		const pageHeights: number[] = [];

		// One output page per pageOp (order / blank / rotation), or 1:1 with the
		// source pages when there are no page ops.
		const ops: PageOp[] = state.pageOps && state.pageOps.length > 0 ? [...state.pageOps] : [];
		if (ops.length === 0) {
			// Probe the source page count by embedding sequentially until it throws.
			const src = await PdfDocument.load(sourcePdf);
			const count = src.getPageCount();
			for (let i = 0; i < count; i++) ops.push({ kind: 'source', sourceIndex: i, rotation: 0 });
		}

		for (const op of ops) {
			if (op.kind === 'source') {
				const embedded = await doc.embedPdfPage(sourcePdf, op.sourceIndex);
				const rotated = normalizeRotation(op.rotation) % 180 !== 0;
				const [w, h] = rotated
					? [embedded.height, embedded.width]
					: [embedded.width, embedded.height];
				const page = doc.addPage([w, h]);
				// Draw the embedded source content at its intrinsic size. Rotation is
				// applied to the page itself (matching the canvas display model).
				page.drawPage(embedded, {
					x: 0,
					y: rotated ? 0 : 0,
					width: embedded.width,
					height: embedded.height
				});
				if (op.rotation) page.setRotation(normalizeRotation(op.rotation));
				// Field/stamp coords are authored against the un-rotated content box, so
				// the page height used for the Y flip is the content height.
				pageHeights.push(embedded.height);
			} else {
				const rotated = normalizeRotation(op.rotation) % 180 !== 0;
				const [w, h] = rotated ? [op.size[1], op.size[0]] : op.size;
				const page = doc.addPage([w, h]);
				if (op.rotation) page.setRotation(normalizeRotation(op.rotation));
				pageHeights.push(op.size[1]);
			}
		}

		const fonts = await embedFonts(doc, state.fonts);
		await stampAndAuthor(doc, state.elements, pageHeights, fonts);
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
		...(f.background ? { background: toColor(f.background) } : {})
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
			// MVP single-widget radios: lay each option out stacked below the anchor.
			form.addRadioGroup(f.name, {
				...(f.required ? { required: true } : {}),
				...(f.readOnly ? { readOnly: true } : {}),
				...(f.tooltip ? { tooltip: f.tooltip } : {}),
				...(f.value ? { selected: f.value } : {}),
				options: options.map((value, i) => ({
					value,
					page,
					x: f.x,
					y: y - i * (size + 6),
					size
				}))
			});
			break;
		}
		case 'dropdown':
		case 'combo':
			// Both author via addDropdown; a plain dropdown is a non-editable combo.
			form.addDropdown(f.name, {
				...base,
				width: f.width,
				height: f.height,
				options: f.options ?? [],
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
