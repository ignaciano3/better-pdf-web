import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { buildPdf, PdfBuildError } from './build';
import type { EditState, SignatureElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function pdfHeader(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes.slice(0, 5));
}

// CRC-32 (PNG/ISO-3309) for chunk checksums.
const CRC_TABLE: number[] = (() => {
	const t: number[] = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type);
	const body = new Uint8Array(typeBytes.length + data.length);
	body.set(typeBytes, 0);
	body.set(data, typeBytes.length);
	const out = new Uint8Array(4 + body.length + 4);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(body, 4);
	view.setUint32(4 + body.length, crc32(body));
	return out;
}

/**
 * Build a tiny valid transparent PNG (RGBA, 8-bit) at the given size. Generated
 * in-test with real deflate + CRC chunks so it survives the wasm decoder, and
 * exercises the transparent-PNG (alpha soft-mask) embed path. All pixels are
 * fully transparent.
 */
function makeTransparentPng(width = 2, height = 2): Uint8Array {
	const ihdr = new Uint8Array(13);
	const ih = new DataView(ihdr.buffer);
	ih.setUint32(0, width);
	ih.setUint32(4, height);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	// 10..12 = compression/filter/interlace = 0

	// Raw scanlines: 1 filter byte + width*4 RGBA bytes, all zero (transparent).
	const raw = new Uint8Array(height * (1 + width * 4));
	const idat = new Uint8Array(deflateSync(raw));

	const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
	const total = parts.reduce((n, p) => n + p.length, 0);
	const png = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		png.set(p, off);
		off += p.length;
	}
	return png;
}

const TINY_TRANSPARENT_PNG = makeTransparentPng();

function signature(overrides: Partial<SignatureElement> = {}): SignatureElement {
	return {
		type: 'signature',
		id: 'sig',
		x: 60,
		y: 100,
		width: 180,
		height: 60,
		image: TINY_TRANSPARENT_PNG,
		format: 'png',
		...overrides
	};
}

describe('buildPdf — signature elements', () => {
	it('builds a valid PDF with a PNG signature in blank-create mode', async () => {
		const state: EditState = { pageSize: A4, elements: [signature()] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('stamps a signature onto a loaded source PDF in source mode', async () => {
		const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			elements: [signature({ page: 0 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('mixes text and signature elements without throwing', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [
				{ type: 'text', id: 't', text: 'Signed by', x: 60, y: 60, size: 14 },
				signature({ id: 'sig', y: 120 })
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips a signature on an out-of-range page without throwing', async () => {
		const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			elements: [signature({ id: 'ok', page: 0 }), signature({ id: 'gone', page: 99 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('still surfaces PdfBuildError for corrupt source bytes', async () => {
		const garbage = new TextEncoder().encode('not a pdf at all');
		const state: EditState = {
			pageSize: A4,
			sourcePdf: garbage,
			elements: [signature()]
		};
		await expect(buildPdf(state)).rejects.toBeInstanceOf(PdfBuildError);
	});
});
