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
 * Collect the multi-select list boxes that carry initial selections. Each entry
 * names a field and the option values to pre-select, filtered to valid options
 * (selectMultiple throws on an unknown value). Empty selections are skipped.
 */
function collectMultiSelections(
	elements: readonly EditElement[]
): { name: string; values: string[] }[] {
	const out: { name: string; values: string[] }[] = [];
	for (const el of elements) {
		if (el.type !== 'field' || el.field !== 'listbox' || !el.multiSelect) continue;
		const options = el.options ?? [];
		const values = (el.selectedValues ?? []).filter((v) => options.includes(v));
		if (values.length > 0) out.push({ name: el.name, values });
	}
	return out;
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
	return hasSource ? buildSourceRebuild(state, sources) : buildBlankRebuild(state);
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
 * page `i`. No-op when the text is empty/whitespace.
 *
 * `drawText` places text with its baseline-left at `(x, y)` and rotates the
 * glyphs about that anchor; its `rotate` is counter-clockwise (origin
 * bottom-left), so the clockwise editor angle is negated. To put the glyph
 * box's *centre* at the page centre for any rotation (matching the CSS preview
 * in `WatermarkOverlay.svelte`, which rotates the centred text about the page
 * centre), we offset the anchor by the centre→anchor vector transformed by the
 * SAME rotation the lib applies (`R(-θ)`, where θ is the editor angle):
 *   u = (textWidth/2, capH/2)  // centre relative to baseline-left, PDF y-up
 *   R(-θ)·u = ( u_x·cosθ + u_y·sinθ , −u_x·sinθ + u_y·cosθ )
 *   anchor = pageCentre − R(-θ)·u
 * (capH ≈ 0.7·size approximates the cap height so the box centres vertically.)
 */
async function drawWatermark(
	doc: PdfDocument,
	pageWidths: number[],
	pageHeights: number[],
	wm: import('./types').Watermark
): Promise<void> {
	// An image watermark takes precedence over text when present.
	if (wm.image && wm.image.byteLength > 0) {
		await drawImageWatermark(doc, pageWidths, pageHeights, wm);
		return;
	}
	const text = wm.text.trim();
	if (text.length === 0) return;
	const size = wm.size ?? 48;
	const fontName = (wm.font ?? 'Helvetica-Bold') as StandardFonts;
	const font = doc.getFont(fontName);
	const color = wm.color ? toColor(wm.color) : rgb(0.5, 0.5, 0.5);
	const angle = wm.rotation ?? 45;
	const rotate = -angle; // drawText rotate is CCW; editor angle is CW
	const opacity = wm.opacity ?? 0.3;
	const textWidth = font.widthOfTextAtSize(text, size);
	const capH = 0.7 * size;
	const theta = (angle * Math.PI) / 180;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	// Centre→anchor offset, rotated by the lib's applied rotation R(-θ).
	const dx = (textWidth / 2) * cos + (capH / 2) * sin;
	const dy = -(textWidth / 2) * sin + (capH / 2) * cos;
	for (let i = 0; i < pageHeights.length; i++) {
		const page = doc.getPage(i);
		const x = (pageWidths[i] as number) / 2 - dx;
		const y = (pageHeights[i] as number) / 2 - dy;
		page.drawText(text, { x, y, size, font, color, opacity, rotate });
	}
}

/**
 * Stamp an image watermark centered, rotated, and semi-transparent on every
 * page. `drawImage` rotates CCW about its anchor `(x, y)` (the un-rotated
 * bottom-left corner), so to land the image's center on the page center we set
 *   anchor = pageCenter − R(θ)·(w/2, h/2)
 * where θ is the applied CCW angle. A decode failure skips silently so a bad
 * image never fails the whole export.
 */
async function drawImageWatermark(
	doc: PdfDocument,
	pageWidths: number[],
	pageHeights: number[],
	wm: import('./types').Watermark
): Promise<void> {
	const bytes = wm.image;
	if (!bytes || bytes.byteLength === 0) return;
	let img;
	try {
		img = wm.format === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
	} catch {
		return; // Undecodable watermark image — skip; export still succeeds.
	}
	const w = wm.imageWidth ?? img.width;
	const h = wm.imageHeight ?? img.height;
	const opacity = wm.opacity ?? 0.3;
	const angle = wm.rotation ?? 45;
	const rotate = -angle; // drawImage rotate is CCW; editor angle is CW
	const theta = (rotate * Math.PI) / 180;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	// Center→anchor offset, rotated by the lib's applied rotation R(θ).
	const ox = (w / 2) * cos - (h / 2) * sin;
	const oy = (w / 2) * sin + (h / 2) * cos;
	for (let i = 0; i < pageHeights.length; i++) {
		const page = doc.getPage(i);
		const x = (pageWidths[i] as number) / 2 - ox;
		const y = (pageHeights[i] as number) / 2 - oy;
		page.drawImage(img, { x, y, width: w, height: h, opacity, rotate });
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

/**
 * Add a blank output page whose un-rotated content box is `size` (PDF points),
 * applying `rotation` to the page. Records the content box into `pageWidths`/
 * `pageHeights` un-rotated, since stamp/field coords are authored against it
 * (the top-left → bottom-left Y flip uses these heights).
 */
function addBlankPage(
	doc: PdfDocument,
	size: [number, number],
	rotation: number,
	pageWidths: number[],
	pageHeights: number[]
): void {
	const rotated = normalizeRotation(rotation) % 180 !== 0;
	const [w, h] = rotated ? [size[1], size[0]] : size;
	const page = doc.addPage([w, h]);
	if (rotation) page.setRotation(normalizeRotation(rotation));
	pageWidths.push(size[0]);
	pageHeights.push(size[1]);
}

/**
 * Shared export tail for both rebuild paths: embed fonts, stamp non-field and
 * field elements, draw the watermark, apply metadata/outline, finish the form
 * in-session, and serialize once. `pageWidths[i]`/`pageHeights[i]` are the
 * un-rotated content box of output page `i`. Keeping this in one place stops the
 * two builders' element/watermark/metadata ordering from drifting apart.
 *
 * Form finishing runs here (not as post-build load/save passes) using 1.9.0's
 * `getForm()`-on-created-doc: multi-select initial values are applied, then the
 * form is flattened when requested. `getForm()` seals the document on first
 * call, so it must come after every drawing and `createForm()` authoring step —
 * which all complete above. Multi-select runs before flatten so the selected
 * appearance is baked into the flattened content. A single final `save()` (the
 * full-document create path) is what lets `objectStreams` reach flattened
 * output.
 */
async function finishDoc(
	doc: PdfDocument,
	state: EditState,
	pageWidths: number[],
	pageHeights: number[]
): Promise<Uint8Array> {
	const fonts = await embedFonts(doc, state.fonts);
	await stampAndAuthor(doc, state.elements, pageHeights, fonts);
	if (state.watermark) await drawWatermark(doc, pageWidths, pageHeights, state.watermark);
	applyDocumentProps(doc, state.metadata, state.outline, pageHeights.length);

	// In-session form finishing. Only touch the form when there is form work to
	// do — calling getForm() would otherwise seal an interactive doc needlessly.
	const multi = collectMultiSelections(state.elements);
	const hasFields = state.elements.some((e) => e.type === 'field');
	const doFlatten = Boolean(state.flatten) && hasFields;
	if (multi.length > 0 || doFlatten) {
		const form = doc.getForm();
		for (const { name, values } of multi) {
			form.getListBox(name).selectMultiple(values);
		}
		if (doFlatten) form.flatten();
	}

	return doc.save(state.objectStreams ? { objectStreams: true } : {});
}

/** Build a fresh single (or page-ops driven) blank document with stamps + fields. */
async function buildBlankRebuild(state: EditState): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	const pageHeights: number[] = [];
	const pageWidths: number[] = [];

	if (state.pageOps && state.pageOps.length > 0) {
		for (const op of state.pageOps) {
			const size = op.kind === 'blank' ? op.size : state.pageSize;
			addBlankPage(doc, size, op.rotation, pageWidths, pageHeights);
		}
	} else {
		addBlankPage(doc, state.pageSize, 0, pageWidths, pageHeights);
	}

	return finishDoc(doc, state, pageWidths, pageHeights);
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
				addBlankPage(doc, op.size, op.rotation, pageWidths, pageHeights);
			}
		}

		return await finishDoc(doc, state, pageWidths, pageHeights);
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
				...(f.multiline ? { multiline: true } : {}),
				// `comb` requires `maxLength` and is mutually exclusive with
				// `multiline` (lib throws otherwise) — only pass it when valid.
				...(f.comb && f.maxLength !== undefined && !f.multiline ? { comb: true } : {}),
				...(f.align ? { align: f.align } : {}),
				...(f.fontSize !== undefined ? { fontSize: f.fontSize } : {}),
				...(f.font ? { font: f.font as StandardFonts } : {}),
				...(f.password ? { password: true } : {}),
				...(f.defaultValue && (f.maxLength === undefined || f.defaultValue.length <= f.maxLength)
					? { defaultValue: f.defaultValue }
					: {})
			});
			break;
		case 'checkbox':
			form.addCheckBox(f.name, {
				...base,
				size: Math.min(f.width, f.height),
				...(f.value ? { checked: true } : {}),
				...(f.checkStyle ? { checkStyle: f.checkStyle } : {}),
				...(f.defaultChecked ? { defaultChecked: true } : {})
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
				...(f.checkStyle ? { checkStyle: f.checkStyle } : {}),
				...(f.defaultSelected && options.includes(f.defaultSelected)
					? { defaultSelected: f.defaultSelected }
					: {}),
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
		case 'combo': {
			// Both author via addDropdown; `editable` (combo box Edit flag) is set
			// only for `combo` so the user can type a value outside `options`.
			//
			// The builder validates `selected`/`defaultSelected` against `options`
			// and throws otherwise. An editable combo, however, legitimately carries
			// a free-text value/default (e.g. round-tripped from an uploaded PDF whose
			// /V is outside /Opt). Fold those free-text entries into the option list so
			// authoring succeeds; for a plain (non-editable) dropdown free-text stays
			// invalid, so an out-of-options default is dropped below.
			const baseOptions = f.options ?? [];
			const extra: string[] = [];
			if (f.field === 'combo') {
				if (f.value && !baseOptions.includes(f.value)) extra.push(f.value);
				if (
					f.defaultSelected &&
					!baseOptions.includes(f.defaultSelected) &&
					!extra.includes(f.defaultSelected)
				) {
					extra.push(f.defaultSelected);
				}
			}
			const options = extra.length > 0 ? [...baseOptions, ...extra] : baseOptions;
			form.addDropdown(f.name, {
				...base,
				width: f.width,
				height: f.height,
				options,
				...(f.field === 'combo' ? { editable: true } : {}),
				...(f.value ? { selected: f.value } : {}),
				...(f.align ? { align: f.align } : {}),
				...(f.fontSize !== undefined ? { fontSize: f.fontSize } : {}),
				...(f.font ? { font: f.font as StandardFonts } : {}),
				...(f.defaultSelected && options.includes(f.defaultSelected)
					? { defaultSelected: f.defaultSelected }
					: {})
			});
			break;
		}
		case 'listbox':
			form.addListBox(f.name, {
				...base,
				width: f.width,
				height: f.height,
				options: f.options ?? [],
				...(f.multiSelect ? { multiSelect: true } : {}),
				// Single-select uses the single `selected`; multi-select initial
				// values are applied in a post-build selectMultiple pass, since the
				// builder accepts only one `selected`.
				...(!f.multiSelect && f.value ? { selected: f.value } : {}),
				...(f.align ? { align: f.align } : {}),
				...(f.fontSize !== undefined ? { fontSize: f.fontSize } : {}),
				...(f.font ? { font: f.font as StandardFonts } : {}),
				...(f.defaultSelected && (f.options ?? []).includes(f.defaultSelected)
					? { defaultSelected: f.defaultSelected }
					: {})
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
