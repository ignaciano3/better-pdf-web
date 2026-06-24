import { PdfDocument, PdfError } from '@ignaciano3/better-pdf';
import type { EditElement, EditState, PageOp } from './types';
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
		return buildFromSource(state.sourcePdf, state.elements, state.pageOps);
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
	elements: readonly EditElement[],
	pageOps?: readonly PageOp[]
): Promise<Uint8Array> {
	try {
		// Phase 1: if page operations are present, rebuild the document's page
		// structure (order / deletions / inserted blanks) and save+reload so the
		// new layout is materialised before we stamp elements onto it. better-pdf's
		// structural ops (insert/remove/move) are reflected after save + reload.
		let bytes = sourcePdf;
		if (pageOps && pageOps.length > 0) {
			bytes = await restructure(sourcePdf, pageOps);
		}

		// Phase 2: stamp elements onto the (possibly restructured) pages. Element
		// `page` indices are output positions, which now match the page order.
		const doc = await PdfDocument.load(bytes);
		const pageCount = doc.getPageCount();

		// Apply rotations to the final pages. (Done here rather than in phase 1 so
		// the single save below carries them; rotation does not need a reload.)
		if (pageOps) {
			for (let i = 0; i < pageOps.length && i < pageCount; i++) {
				const rotation = normalizeRotation(pageOps[i]?.rotation ?? 0);
				if (rotation !== 0) doc.getPage(i).setRotation(rotation);
			}
		}

		for (const element of elements) {
			const pageIndex = element.page ?? 0;
			if (pageIndex < 0 || pageIndex >= pageCount) continue;
			const page = doc.getPage(pageIndex);
			await renderElement({ doc, page, pageHeight: page.height }, element);
		}
		// Parsing of malformed input can surface here (lazily at save time).
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

/** Normalise an arbitrary degree value to one of 0/90/180/270. */
function normalizeRotation(degrees: number): number {
	return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

/**
 * Rebuild the page structure of `sourcePdf` to match `pageOps` (order, deletions,
 * inserted blanks) and return the saved+reloaded bytes. Rotations are NOT applied
 * here — the caller applies them after reload.
 *
 * Strategy: start from the loaded source, append a blank for every `blank` op,
 * then sort all pages into the desired output order with `movePage`, and finally
 * drop any source pages that no output op references.
 */
async function restructure(sourcePdf: Uint8Array, pageOps: readonly PageOp[]): Promise<Uint8Array> {
	const doc = await PdfDocument.load(sourcePdf);
	const originalCount = doc.getPageCount();

	// Track a stable identity for each currently-present page so we can locate it
	// after moves shift indices. Source pages are 's<index>', blanks are 'b<n>'.
	const order: string[] = [];
	for (let i = 0; i < originalCount; i++) order.push(`s${i}`);

	// Append a blank for each blank op (appended pages land at the end for now).
	let blankCounter = 0;
	const blankIds: string[] = [];
	for (const op of pageOps) {
		if (op.kind === 'blank') {
			doc.addPage(op.size);
			const id = `b${blankCounter++}`;
			order.push(id);
			blankIds.push(id);
		}
	}

	// Desired final order expressed in the same identity space.
	let blankPick = 0;
	const target: string[] = pageOps.map((op) =>
		op.kind === 'source' ? `s${op.sourceIndex}` : (blankIds[blankPick++] as string)
	);

	// Selection-sort the live `order` into `target` using movePage. Any live page
	// not in `target` is a deleted source page; it stays at the tail and is
	// removed afterwards.
	for (let pos = 0; pos < target.length; pos++) {
		const wantId = target[pos];
		const from = order.indexOf(wantId as string);
		if (from === -1) continue; // referenced source page missing; skip defensively
		if (from !== pos) {
			doc.movePage(from, pos);
			order.splice(pos, 0, order.splice(from, 1)[0] as string);
		}
	}

	// Remove trailing pages beyond the target length (deleted source pages).
	for (let i = order.length - 1; i >= target.length; i--) {
		doc.removePage(i);
	}

	return await doc.save();
}
