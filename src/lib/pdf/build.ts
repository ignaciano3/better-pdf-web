import { PdfDocument, PdfError } from '@ignaciano3/better-pdf';
import { rgb, type PdfPage } from '@ignaciano3/better-pdf/generate';
import type { EditElement, EditState, SignatureElement, TextElement } from './types';

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
 * Two modes:
 * - **Blank mode** (no `sourcePdf`): create a fresh single-page document and
 *   draw the elements onto it.
 * - **Source mode** (`sourcePdf` present): load the uploaded PDF and stamp the
 *   elements on top of its existing pages, preserving the original page count.
 *
 * This is the dogfooding seam: every editor element is rendered through the
 * better-pdf authoring API. Runs server-side (Node/Bun) where the wasm core
 * self-initializes on import.
 *
 * Canvas coordinates are top-left origin; PDF uses bottom-left, so the Y axis
 * is flipped here. `y` is the element's top edge, so the text baseline is
 * placed one font-size below it.
 */
export async function buildPdf(state: EditState): Promise<Uint8Array> {
	if (state.sourcePdf && state.sourcePdf.byteLength > 0) {
		return buildFromSource(state.sourcePdf, state.elements);
	}
	return buildBlank(state);
}

async function buildBlank(state: EditState): Promise<Uint8Array> {
	const pageHeight = state.pageSize[1];
	const doc = await PdfDocument.create();
	const page = doc.addPage(state.pageSize);

	for (const element of state.elements) {
		await drawElement(doc, page, element, pageHeight);
	}

	return doc.save();
}

async function buildFromSource(
	sourcePdf: Uint8Array,
	elements: readonly EditElement[]
): Promise<Uint8Array> {
	try {
		const doc = await PdfDocument.load(sourcePdf);
		const pageCount = doc.getPageCount();
		for (const element of elements) {
			const pageIndex = element.page ?? 0;
			if (pageIndex < 0 || pageIndex >= pageCount) continue;
			const page = doc.getPage(pageIndex);
			await drawElement(doc, page, element, page.height);
		}
		// Parsing of malformed input can surface here (lazily at save time).
		return await doc.save();
	} catch (cause) {
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
 * Dispatch on element type. Image embedding is async (the wasm core embeds the
 * bytes), so this returns a promise even though text drawing is synchronous.
 */
async function drawElement(
	doc: PdfDocument,
	page: PdfPage,
	element: EditElement,
	pageHeight: number
): Promise<void> {
	if (element.type === 'signature') {
		await drawSignatureElement(doc, page, element, pageHeight);
		return;
	}
	drawTextElement(page, element, pageHeight);
}

function drawTextElement(page: PdfPage, element: TextElement, pageHeight: number): void {
	const baselineY = pageHeight - element.y - element.size;
	const { color } = element;
	page.drawText(element.text, {
		x: element.x,
		y: baselineY,
		size: element.size,
		...(color ? { color: rgb(color.r, color.g, color.b) } : {})
	});
}

/**
 * Embed and stamp a signature image. The element's `y` is its top edge in a
 * top-left coordinate system, so the PDF (bottom-left origin) bottom edge sits
 * at `pageHeight - y - height`. Transparent PNGs keep their alpha channel as a
 * soft mask automatically — no white box is painted over underlying content.
 */
async function drawSignatureElement(
	doc: PdfDocument,
	page: PdfPage,
	element: SignatureElement,
	pageHeight: number
): Promise<void> {
	const image =
		element.format === 'png'
			? await doc.embedPng(element.image)
			: await doc.embedJpg(element.image);
	const bottomY = pageHeight - element.y - element.height;
	page.drawImage(image, {
		x: element.x,
		y: bottomY,
		width: element.width,
		height: element.height
	});
}
