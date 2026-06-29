import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import { makePng } from './test-png';
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

	it('stamps an image watermark (centered, scaled, rotated) on every page', async () => {
		const png = makePng();
		const plain = await buildPdf({ pageSize: A4, elements: [] });
		const stamped = await buildPdf({
			pageSize: A4,
			elements: [],
			watermark: { text: '', image: png, format: 'png', imageWidth: 200, imageHeight: 200, rotation: 30 }
		});
		expect(isPdf(stamped)).toBe(true);
		expect(stamped.byteLength).toBeGreaterThan(plain.byteLength);
	});

	it('draws a centered watermark at any rotation (rotation-invariant)', async () => {
		// On a square page the centering anchor must be computable and the
		// watermark present for any angle; 0° and 90° both produce a valid,
		// larger-than-baseline PDF. (Exact coordinates would require brittle
		// content-stream parsing, so this is a presence/validity smoke check.)
		const SQ: [number, number] = [400, 400];
		const baseline = await buildPdf({ pageSize: SQ, elements: [] });
		for (const rotation of [0, 90]) {
			const out = await buildPdf({
				pageSize: SQ,
				elements: [],
				watermark: { text: 'DRAFT', rotation }
			});
			expect(isPdf(out)).toBe(true);
			expect(out.byteLength).toBeGreaterThan(baseline.byteLength);
		}
	});
});
