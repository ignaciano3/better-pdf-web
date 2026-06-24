import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import type { EditState, LinkElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

function link(overrides: Partial<LinkElement> = {}): LinkElement {
	return {
		type: 'link',
		id: 'l0',
		x: 50,
		y: 50,
		width: 120,
		height: 24,
		...overrides
	};
}

describe('buildPdf — link elements (drawLink)', () => {
	it('renders an external URL link to a valid PDF', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [link({ url: 'https://example.com' })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('renders an internal goToPage link across a 2-page doc', async () => {
		const state: EditState = {
			pageSize: A4,
			pageOps: [
				{ kind: 'blank', size: A4, rotation: 0 },
				{ kind: 'blank', size: A4, rotation: 0 }
			],
			elements: [link({ page: 0, goToPage: 1 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips a link with neither url nor goToPage without throwing', async () => {
		const state: EditState = { pageSize: A4, elements: [link()] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips a link with both url and goToPage (renderer guard)', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [link({ url: 'https://x.test', goToPage: 0 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});
});
