import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import type { MarkupElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function isPdf(bytes: Uint8Array): boolean {
	return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

function markup(overrides: Partial<MarkupElement> = {}): MarkupElement {
	return {
		type: 'markup',
		id: 'm1',
		markup: 'highlight',
		x: 40,
		y: 60,
		width: 200,
		height: 16,
		page: 0,
		color: { r: 1, g: 0.92, b: 0.23 },
		opacity: 0.4,
		...overrides
	};
}

describe('buildPdf markup round-trip', () => {
	it('stamps a highlight, producing a valid, larger PDF', async () => {
		const plain = await buildPdf({ pageSize: A4, elements: [] });
		const out = await buildPdf({ pageSize: A4, elements: [markup()] });
		expect(isPdf(out)).toBe(true);
		expect(out.byteLength).toBeGreaterThan(plain.byteLength);
	});

	it('stamps underline and strikethrough as line draws', async () => {
		const plain = await buildPdf({ pageSize: A4, elements: [] });
		for (const kind of ['underline', 'strikethrough'] as const) {
			const out = await buildPdf({
				pageSize: A4,
				elements: [markup({ markup: kind, thickness: 2, color: { r: 0, g: 0, b: 0 } })]
			});
			expect(isPdf(out)).toBe(true);
			expect(out.byteLength).toBeGreaterThan(plain.byteLength);
		}
	});
});
