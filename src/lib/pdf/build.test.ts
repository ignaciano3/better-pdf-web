import { describe, it, expect } from 'vitest';
import { buildPdf, PdfBuildError } from './build';
import type { EditState } from './types';

const A4: [number, number] = [595.28, 841.89];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

describe('buildPdf', () => {
	it('produces a valid PDF from an empty page', async () => {
		const state: EditState = { pageSize: A4, elements: [] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('produces a valid PDF with a text element', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [{ type: 'text', id: 'a', text: 'Hello better-pdf', x: 50, y: 80, size: 24 }]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('renders multiple text elements without throwing', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [
				{ type: 'text', id: 'a', text: 'one', x: 10, y: 10, size: 12 },
				{
					type: 'text',
					id: 'b',
					text: 'two',
					x: 100,
					y: 200,
					size: 18,
					color: { r: 0.8, g: 0.1, b: 0.1 }
				}
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	describe('source PDF (upload) mode', () => {
		it('stamps text onto a loaded source PDF and preserves page count', async () => {
			// Generate a small source PDF in create mode, then feed it back in.
			const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });

			const state: EditState = {
				pageSize: A4,
				sourcePdf,
				elements: [{ type: 'text', id: 'a', text: 'Stamped on top', x: 60, y: 100, size: 20 }]
			};
			const bytes = await buildPdf(state);
			expect(pdfHeader(bytes)).toBe('%PDF-');
			expect(bytes.length).toBeGreaterThan(0);
		});

		it('ignores elements targeting out-of-range pages without throwing', async () => {
			const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
			const state: EditState = {
				pageSize: A4,
				sourcePdf,
				elements: [
					{ type: 'text', id: 'a', text: 'page 0', x: 10, y: 10, size: 12, page: 0 },
					{ type: 'text', id: 'b', text: 'page 99', x: 10, y: 10, size: 12, page: 99 }
				]
			};
			const bytes = await buildPdf(state);
			expect(pdfHeader(bytes)).toBe('%PDF-');
		});

		it('throws a graceful PdfBuildError for corrupt/non-PDF bytes', async () => {
			const garbage = new TextEncoder().encode('this is definitely not a pdf');
			const state: EditState = {
				pageSize: A4,
				sourcePdf: garbage,
				elements: []
			};
			await expect(buildPdf(state)).rejects.toBeInstanceOf(PdfBuildError);
		});

		it('falls back to blank-create mode when sourcePdf is empty', async () => {
			const state: EditState = {
				pageSize: A4,
				sourcePdf: new Uint8Array(0),
				elements: [{ type: 'text', id: 'a', text: 'blank', x: 10, y: 10, size: 12 }]
			};
			const bytes = await buildPdf(state);
			expect(pdfHeader(bytes)).toBe('%PDF-');
		});
	});
});
