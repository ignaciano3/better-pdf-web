import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState } from './types';

describe('buildPdf rich text', () => {
	it('renders a styled text element to a valid one-page PDF', async () => {
		const state: EditState = {
			pageSize: [300, 400],
			elements: [
				{
					type: 'text',
					id: 't0',
					text: 'Styled',
					x: 20,
					y: 30,
					size: 18,
					page: 0,
					font: 'Times-BoldItalic',
					color: { r: 0.2, g: 0.4, b: 0.6 },
					opacity: 0.5,
					rotation: 15,
					lineHeight: 22,
					maxWidth: 200
				}
			]
		};
		const bytes = await buildPdf(state);
		expect(bytes.byteLength).toBeGreaterThan(0);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getPageCount()).toBe(1);
	});
});
