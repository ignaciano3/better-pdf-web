import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import type { EditState, PathElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

function path(overrides: Partial<PathElement> = {}): PathElement {
	return {
		type: 'path',
		id: 'p0',
		x: 50,
		y: 50,
		points: [
			{ x: 50, y: 50 },
			{ x: 120, y: 90 },
			{ x: 180, y: 60 }
		],
		closed: false,
		strokeColor: { r: 0, g: 0, b: 0 },
		strokeWidth: 2,
		...overrides
	};
}

describe('buildPdf — path elements (drawSvgPath)', () => {
	it('renders an open freehand path to a valid PDF', async () => {
		const state: EditState = { pageSize: A4, elements: [path()] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('renders a closed, filled path', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [path({ closed: true, fillColor: { r: 0.2, g: 0.6, b: 0.9 }, opacity: 0.5 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips an empty-point path without throwing', async () => {
		const state: EditState = { pageSize: A4, elements: [path({ points: [] })] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('stamps a path onto a loaded source PDF', async () => {
		const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
		const state: EditState = { pageSize: A4, sourcePdf, elements: [path({ page: 0 })] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});
});
