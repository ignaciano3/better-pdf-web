import { deflateSync } from 'node:zlib';

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
 * Build a tiny valid opaque RGBA PNG at the given size. Generated with real
 * deflate + CRC chunks so it survives the wasm image decoder. Test-only.
 */
export function makePng(width = 2, height = 2): Uint8Array {
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
