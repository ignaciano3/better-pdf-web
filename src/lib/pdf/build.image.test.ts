import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { buildPdf, PdfBuildError } from './build';
import type { EditState, ImageElement } from './types';

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
 * Build a tiny valid opaque RGBA PNG at the given size. Generated in-test with
 * real deflate + CRC chunks so it survives the wasm decoder.
 */
function makePng(width = 2, height = 2): Uint8Array {
	const ihdr = new Uint8Array(13);
	const ih = new DataView(ihdr.buffer);
	ih.setUint32(0, width);
	ih.setUint32(4, height);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA

	// Raw scanlines: 1 filter byte + width*4 RGBA bytes; opaque red pixels.
	const raw = new Uint8Array(height * (1 + width * 4));
	for (let row = 0; row < height; row++) {
		const base = row * (1 + width * 4);
		for (let col = 0; col < width; col++) {
			const p = base + 1 + col * 4;
			raw[p] = 255; // R
			raw[p + 3] = 255; // A
		}
	}
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

const TINY_PNG = makePng();

function image(overrides: Partial<ImageElement> = {}): ImageElement {
	return {
		type: 'image',
		id: 'img',
		x: 50,
		y: 80,
		width: 200,
		height: 120,
		image: TINY_PNG,
		format: 'png',
		...overrides
	};
}

describe('buildPdf — image elements', () => {
	it('builds a valid PDF with a PNG image in blank-create mode', async () => {
		const state: EditState = { pageSize: A4, elements: [image()] };
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('stamps an image onto a loaded source PDF in source mode', async () => {
		const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			elements: [image({ page: 0 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('mixes text and image elements without throwing', async () => {
		const state: EditState = {
			pageSize: A4,
			elements: [
				{ type: 'text', id: 't', text: 'Figure 1', x: 60, y: 60, size: 14 },
				image({ id: 'img', y: 120 })
			]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips an image on an out-of-range page without throwing', async () => {
		const sourcePdf = await buildPdf({ pageSize: A4, elements: [] });
		const state: EditState = {
			pageSize: A4,
			sourcePdf,
			elements: [image({ id: 'ok', page: 0 }), image({ id: 'gone', page: 99 })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('skips an undecodable image without crashing the export', async () => {
		const garbageImage = new TextEncoder().encode('not a real png');
		const state: EditState = {
			pageSize: A4,
			elements: [image({ image: garbageImage })]
		};
		const bytes = await buildPdf(state);
		expect(pdfHeader(bytes)).toBe('%PDF-');
	});

	it('still surfaces PdfBuildError for corrupt source bytes', async () => {
		const garbage = new TextEncoder().encode('not a pdf at all');
		const state: EditState = {
			pageSize: A4,
			sourcePdf: garbage,
			elements: [image()]
		};
		await expect(buildPdf(state)).rejects.toBeInstanceOf(PdfBuildError);
	});
});
