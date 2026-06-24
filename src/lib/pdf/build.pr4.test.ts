import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState, PageOp } from './types';

const A4: [number, number] = [595.28, 841.89];
const LETTER: [number, number] = [612, 792];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

/** Build a source PDF with `n` A4 pages, each carrying a tiny text marker. */
async function makeSource(n: number, label = 'page'): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	for (let i = 0; i < n; i++) {
		const page = doc.addPage(A4);
		page.drawText(`${label} ${i}`, { x: 50, y: 700, size: 24 });
	}
	return doc.save();
}

async function loadDoc(bytes: Uint8Array): Promise<PdfDocument> {
	return PdfDocument.load(bytes);
}

describe('buildPdf — PR4 page size override', () => {
	it('creates a source page at the override size', async () => {
		const sourcePdf = await makeSource(1);
		const pageOps: PageOp[] = [{ kind: 'source', sourceIndex: 0, rotation: 0, size: LETTER }];
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [], pageOps });
		expect(pdfHeader(bytes)).toBe('%PDF-');
		const doc = await loadDoc(bytes);
		const page = doc.getPage(0);
		expect(Math.round(page.width)).toBe(Math.round(LETTER[0]));
		expect(Math.round(page.height)).toBe(Math.round(LETTER[1]));
	});

	it('without an override keeps the source page size (A4)', async () => {
		const sourcePdf = await makeSource(1);
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [] });
		const doc = await loadDoc(bytes);
		const page = doc.getPage(0);
		expect(Math.round(page.width)).toBe(Math.round(A4[0]));
		expect(Math.round(page.height)).toBe(Math.round(A4[1]));
	});
});

describe('buildPdf — PR4 multi-source merge', () => {
	it('appends a second document via sources + docIndex', async () => {
		const docA = await makeSource(2, 'a');
		const docB = await makeSource(3, 'b');
		const pageOps: PageOp[] = [
			{ kind: 'source', docIndex: 0, sourceIndex: 0, rotation: 0 },
			{ kind: 'source', docIndex: 0, sourceIndex: 1, rotation: 0 },
			{ kind: 'source', docIndex: 1, sourceIndex: 0, rotation: 0 },
			{ kind: 'source', docIndex: 1, sourceIndex: 1, rotation: 0 },
			{ kind: 'source', docIndex: 1, sourceIndex: 2, rotation: 0 }
		];
		const bytes = await buildPdf({ pageSize: A4, sources: [docA, docB], elements: [], pageOps });
		expect(pdfHeader(bytes)).toBe('%PDF-');
		const doc = await loadDoc(bytes);
		expect(doc.getPageCount()).toBe(5);
	});

	it('still works with the legacy single sourcePdf field (no docIndex)', async () => {
		const sourcePdf = await makeSource(2);
		const bytes = await buildPdf({ pageSize: A4, sourcePdf, elements: [] });
		const doc = await loadDoc(bytes);
		expect(doc.getPageCount()).toBe(2);
	});
});

describe('buildPdf — PR4 metadata', () => {
	it('round-trips metadata via getMetadata after build', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [],
			metadata: {
				title: 'My Title',
				author: 'Jane Doe',
				subject: 'A subject',
				keywords: ['alpha', 'beta'],
				creator: 'better-pdf-web',
				producer: 'better-pdf'
			}
		};
		const bytes = await buildPdf(state);
		const doc = await loadDoc(bytes);
		const meta = await doc.getMetadata();
		expect(meta.title).toBe('My Title');
		expect(meta.author).toBe('Jane Doe');
		expect(meta.subject).toBe('A subject');
	});

	it('applies metadata in the source rebuild path too', async () => {
		const sourcePdf = await makeSource(1);
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			elements: [],
			metadata: { title: 'Sourced' }
		};
		const bytes = await buildPdf(state);
		const doc = await loadDoc(bytes);
		const meta = await doc.getMetadata();
		expect(meta.title).toBe('Sourced');
	});
});

describe('buildPdf — PR4 outline', () => {
	it('saves successfully with a valid outline', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [],
			pageOps: [
				{ kind: 'blank', size: A4, rotation: 0 },
				{ kind: 'blank', size: A4, rotation: 0 }
			],
			outline: [
				{ title: 'Chapter 1', page: 0, children: [{ title: 'Section 1.1', page: 1 }] },
				{ title: 'Chapter 2', page: 1 }
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		const doc = await loadDoc(bytes);
		expect(doc.getPageCount()).toBe(2);
	});
});
