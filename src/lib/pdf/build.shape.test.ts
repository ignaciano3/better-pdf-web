import { describe, it, expect } from 'vitest';
import { buildPdf, PdfBuildError } from './build';
import type { EditState, ShapeElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

function shape(overrides: Partial<ShapeElement> = {}): ShapeElement {
	return {
		type: 'shape',
		id: 'shp',
		shape: 'rectangle',
		x: 50,
		y: 80,
		width: 120,
		height: 90,
		strokeColor: { r: 0, g: 0, b: 0 },
		strokeWidth: 1,
		...overrides
	};
}

describe('buildPdf — shape elements', () => {
	const kinds = ['line', 'rectangle', 'ellipse'] as const;

	for (const kind of kinds) {
		it(`builds a valid PDF with a ${kind} in blank-create mode`, async () => {
			const state: EditState = { pageSize: A4, elements: [shape({ shape: kind })] };
			const bytes = await buildPdf(state);
			expect(pdfHeader(bytes)).toBe('%PDF-');
			expect(bytes.length).toBeGreaterThan(0);
		});

		it(`stamps a ${kind} onto a loaded source PDF in source mode`, async () => {
			const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
			const state: EditState = {
				pageSize: A4,
				sourcePdf,
				elements: [shape({ shape: kind, page: 0 })]
			};
			const bytes = await buildPdf(state);
			expect(pdfHeader(bytes)).toBe('%PDF-');
			expect(bytes.length).toBeGreaterThan(0);
		});
	}

	it('draws a filled rectangle and ellipse without throwing', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [
				shape({ id: 'r', shape: 'rectangle', fillColor: { r: 0.9, g: 0.2, b: 0.2 } }),
				shape({ id: 'e', shape: 'ellipse', y: 220, fillColor: { r: 0.2, g: 0.5, b: 0.9 } })
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('mixes text and shape elements without throwing', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [
				{ type: 'text', id: 't', text: 'Box below', x: 50, y: 50, size: 14 },
				shape({ id: 'box', y: 80 })
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('builds with a shape carrying only defaults (no explicit colors)', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [{ type: 'shape', id: 'd', shape: 'line', x: 30, y: 30, width: 100, height: 60 }]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips a shape on an out-of-range page without throwing', async () => {
		const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			elements: [shape({ id: 'ok', page: 0 }), shape({ id: 'gone', page: 99 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('still surfaces PdfBuildError for corrupt source bytes', async () => {
		const garbage = new TextEncoder().encode('not a pdf at all');
		const state: EditState = { pageSize: A4, sourcePdf: garbage, elements: [shape()] };
		await expect(buildPdf(state)).rejects.toBeInstanceOf(PdfBuildError);
	});
});
