import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState, PageOp } from './types';

const A4: [number, number] = [595.28, 841.89];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

/** Build a source PDF with `n` pages, each carrying a tiny text marker. */
async function makeSource(n: number): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	for (let i = 0; i < n; i++) {
		const page = doc.addPage(A4);
		page.drawText(`page ${i}`, { x: 50, y: 700, size: 24 });
	}
	return doc.save();
}

/** Count pages in a saved PDF by reloading it. */
async function pageCount(bytes: Uint8Array): Promise<number> {
	const doc = await PdfDocument.load(bytes);
	return doc.getPageCount();
}

describe('buildPdf — page operations', () => {
	it('keeps source pages unchanged when no pageOps are given', async () => {
		const sourcePdf = await makeSource(3);
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [] });
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(await pageCount(bytes)).toBe(3);
	});

	it('reorders pages', async () => {
		const sourcePdf = await makeSource(3);
		const pageOps: PageOp[] = [
			{ kind: 'source', sourceIndex: 2, rotation: 0 },
			{ kind: 'source', sourceIndex: 0, rotation: 0 },
			{ kind: 'source', sourceIndex: 1, rotation: 0 }
		];
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [], pageOps });
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(await pageCount(bytes)).toBe(3);
	});

	it('deletes a page', async () => {
		const sourcePdf = await makeSource(3);
		const pageOps: PageOp[] = [
			{ kind: 'source', sourceIndex: 0, rotation: 0 },
			{ kind: 'source', sourceIndex: 2, rotation: 0 }
		];
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [], pageOps });
		expect(await pageCount(bytes)).toBe(2);
	});

	it('inserts a blank page', async () => {
		const sourcePdf = await makeSource(2);
		const pageOps: PageOp[] = [
			{ kind: 'source', sourceIndex: 0, rotation: 0 },
			{ kind: 'blank', size: A4, rotation: 0 },
			{ kind: 'source', sourceIndex: 1, rotation: 0 }
		];
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [], pageOps });
		expect(await pageCount(bytes)).toBe(3);
	});

	it('rotates a page', async () => {
		const sourcePdf = await makeSource(1);
		const pageOps: PageOp[] = [{ kind: 'source', sourceIndex: 0, rotation: 90 }];
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [], pageOps });
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(await pageCount(bytes)).toBe(1);
	});

	it('combines reorder, delete, insert-blank and rotate', async () => {
		const sourcePdf = await makeSource(4);
		const pageOps: PageOp[] = [
			{ kind: 'source', sourceIndex: 3, rotation: 90 },
			{ kind: 'blank', size: A4, rotation: 0 },
			{ kind: 'source', sourceIndex: 1, rotation: 180 }
			// sourceIndex 0 and 2 dropped
		];
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [], pageOps });
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(await pageCount(bytes)).toBe(3);
	});

	it('stamps elements onto the correct output page after reorder', async () => {
		const sourcePdf = await makeSource(2);
		const pageOps: PageOp[] = [
			{ kind: 'source', sourceIndex: 1, rotation: 0 },
			{ kind: 'source', sourceIndex: 0, rotation: 0 }
		];
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			pageOps,
			elements: [
				{ type: 'text', id: 'a', text: 'on output page 0', x: 40, y: 60, size: 18, page: 0 }
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(await pageCount(bytes)).toBe(2);
	});

	it('stamps an element onto an inserted blank page', async () => {
		const sourcePdf = await makeSource(1);
		const pageOps: PageOp[] = [
			{ kind: 'source', sourceIndex: 0, rotation: 0 },
			{ kind: 'blank', size: A4, rotation: 0 }
		];
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			pageOps,
			elements: [
				{ type: 'text', id: 'a', text: 'on the blank page', x: 40, y: 60, size: 18, page: 1 }
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(await pageCount(bytes)).toBe(2);
	});
});
