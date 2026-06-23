import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
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
});
