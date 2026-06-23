import { PdfDocument, PdfError } from '@ignaciano3/better-pdf';
import type { EditElement, EditState } from './types';
import { renderElement } from './renderers';

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
 * better-pdf authoring API (via the renderer registry). Runs server-side
 * (Node/Bun) where the wasm core self-initializes on import.
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
		await renderElement({ doc, page, pageHeight }, element);
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
			await renderElement({ doc, page, pageHeight: page.height }, element);
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
