import { PdfDocument } from '@ignaciano3/better-pdf';
import { rgb, type PdfPage } from '@ignaciano3/better-pdf/generate';
import type { EditState, TextElement } from './types';

/**
 * Finalize editor state into PDF bytes using better-pdf.
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
	const pageHeight = state.pageSize[1];
	const doc = await PdfDocument.create();
	const page = doc.addPage(state.pageSize);

	for (const element of state.elements) {
		drawTextElement(page, element, pageHeight);
	}

	return doc.save();
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
