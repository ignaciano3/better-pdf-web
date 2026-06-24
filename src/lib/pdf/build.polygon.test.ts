import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import type { EditState, PolygonElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

function polygon(overrides: Partial<PolygonElement> = {}): PolygonElement {
	return {
		type: 'polygon',
		id: 'pg0',
		x: 60,
		y: 60,
		points: [
			{ x: 60, y: 60 },
			{ x: 160, y: 60 },
			{ x: 160, y: 160 },
			{ x: 60, y: 160 }
		],
		closed: true,
		strokeColor: { r: 0, g: 0, b: 0 },
		strokeWidth: 1,
		...overrides
	};
}

describe('buildPdf — polygon elements (drawPolygon)', () => {
	it('renders a closed polygon to a valid PDF', async () => {
		const state: EditState = { pageSize: A4, elements: [polygon()] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('renders an open, filled polyline polygon', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [polygon({ closed: false, fillColor: { r: 0.9, g: 0.4, b: 0.1 }, opacity: 0.6 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips a polygon with fewer than 2 points without throwing', async () => {
		const state: EditState = { pageSize: A4, elements: [polygon({ points: [{ x: 1, y: 1 }] })] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('stamps a polygon onto a loaded source PDF', async () => {
		const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
		const state: EditState = { pageSize: A4, sourcePdf, elements: [polygon({ page: 0 })] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});
});
