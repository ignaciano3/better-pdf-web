import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import type { EditState } from './types';

const A4: [number, number] = [595.28, 841.89];

function isPdf(bytes: Uint8Array): boolean {
	return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

describe('buildPdf watermark', () => {
	it('produces a valid, larger PDF when a watermark is set', async () => {
		const base: EditState = { pageSize: A4, elements: [] };
		const withWm: EditState = { ...base, watermark: { text: 'DRAFT' } };
		const plain = await buildPdf(base);
		const stamped = await buildPdf(withWm);
		expect(isPdf(stamped)).toBe(true);
		expect(stamped.byteLength).toBeGreaterThan(plain.byteLength);
	});

	it('ignores an empty-text watermark', async () => {
		const base = await buildPdf({ pageSize: A4, elements: [] });
		const empty = await buildPdf({ pageSize: A4, elements: [], watermark: { text: '   ' } });
		expect(empty.byteLength).toBe(base.byteLength);
	});
});
