import { describe, it, expect } from 'vitest';
import { buildPdf } from './build';
import type { EditState, PageOp } from './types';

const A4: [number, number] = [595.28, 841.89];

function isPdf(bytes: Uint8Array): boolean {
	return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

/** Raw-byte view for asserting drawn literal strings on the uncompressed
 *  create-path output (content streams are not object-stream-packed by default). */
function asLatin1(bytes: Uint8Array): string {
	return new TextDecoder('latin1').decode(bytes);
}

/** N blank A4 pages via pageOps, so we can exercise multi-page numbering. */
function blanks(n: number): PageOp[] {
	return Array.from({ length: n }, () => ({ kind: 'blank', size: A4, rotation: 0 }) as PageOp);
}

describe('buildPdf header/footer', () => {
	it('produces a valid, larger PDF when a footer is set', async () => {
		const base: EditState = { pageSize: A4, elements: [] };
		const withHf: EditState = {
			...base,
			headerFooter: { footer: { slots: { center: 'Page {n} of {total}' } } }
		};
		const plain = await buildPdf(base);
		const stamped = await buildPdf(withHf);
		expect(isPdf(stamped)).toBe(true);
		expect(stamped.byteLength).toBeGreaterThan(plain.byteLength);
	});

	it('ignores a header/footer whose every slot is empty', async () => {
		const base = await buildPdf({ pageSize: A4, elements: [] });
		const empty = await buildPdf({
			pageSize: A4,
			elements: [],
			headerFooter: { footer: { slots: { center: '   ' } }, header: { slots: { left: '' } } }
		});
		expect(empty.byteLength).toBe(base.byteLength);
	});

	it('stamps all six slots across a multi-page document', async () => {
		const plain = await buildPdf({ pageSize: A4, elements: [], pageOps: blanks(3) });
		const stamped = await buildPdf({
			pageSize: A4,
			elements: [],
			pageOps: blanks(3),
			headerFooter: {
				header: { slots: { left: 'H-L', center: 'H-C', right: 'H-R' } },
				footer: { slots: { left: 'F-L', center: 'Page {n} of {total}', right: 'F-R' } }
			}
		});
		expect(isPdf(stamped)).toBe(true);
		expect(stamped.byteLength).toBeGreaterThan(plain.byteLength);
	});

	it('substitutes {n} and {total} per page across the document', async () => {
		const out = await buildPdf({
			pageSize: A4,
			elements: [],
			pageOps: blanks(3),
			headerFooter: { footer: { slots: { center: 'Page {n} of {total}' } } }
		});
		const text = asLatin1(out);
		expect(text).toContain('Page 1 of 3');
		expect(text).toContain('Page 2 of 3');
		expect(text).toContain('Page 3 of 3');
	});

	it('substitutes {title} from document metadata', async () => {
		const out = await buildPdf({
			pageSize: A4,
			elements: [],
			metadata: { title: 'Quarterly Report' },
			headerFooter: { header: { slots: { center: '{title}' } } }
		});
		expect(asLatin1(out)).toContain('Quarterly Report');
	});

	it('honors skipFirst: page 0 unstamped, numbering starts at page 1, total excludes it', async () => {
		const out = await buildPdf({
			pageSize: A4,
			elements: [],
			pageOps: blanks(3),
			headerFooter: {
				footer: { slots: { center: 'Page {n} of {total}' } },
				skipFirst: true,
				startAt: 1
			}
		});
		const text = asLatin1(out);
		// 3 pages, first skipped ⇒ two numbered pages, total = 2.
		expect(text).toContain('Page 1 of 2');
		expect(text).toContain('Page 2 of 2');
		expect(text).not.toContain('of 3');
		expect(text).not.toContain('Page 0');
	});

	it('offsets numbering with startAt', async () => {
		const out = await buildPdf({
			pageSize: A4,
			elements: [],
			pageOps: blanks(2),
			headerFooter: { footer: { slots: { right: '{n}' } }, startAt: 5 }
		});
		const text = asLatin1(out);
		expect(text).toContain('(5)');
		expect(text).toContain('(6)');
	});

	it('uses each section its own font (independent header/footer styling)', async () => {
		// Single-section outputs stay uncompressed, so the chosen BaseFont name is
		// visible in the font resource dict. A header asking for Courier must embed
		// Courier; a footer asking for Times-Bold must embed Times — proving the
		// per-section `font` flows through to `getFont`.
		const courierHeader = await buildPdf({
			pageSize: A4,
			elements: [],
			headerFooter: { header: { slots: { center: 'H' }, font: 'Courier' } }
		});
		const timesFooter = await buildPdf({
			pageSize: A4,
			elements: [],
			headerFooter: { footer: { slots: { center: 'F' }, font: 'Times-Bold' } }
		});
		const defaultHeader = await buildPdf({
			pageSize: A4,
			elements: [],
			headerFooter: { header: { slots: { center: 'H' } } }
		});
		expect(asLatin1(courierHeader)).toContain('Courier');
		expect(asLatin1(timesFooter)).toContain('Times');
		// Default is Helvetica, never Courier — confirms it isn't a constant.
		expect(asLatin1(defaultHeader)).toContain('Helvetica');
		expect(asLatin1(defaultHeader)).not.toContain('Courier');
	});

	it('stamps a header alone when no footer section is present', async () => {
		const out = await buildPdf({
			pageSize: A4,
			elements: [],
			headerFooter: { header: { slots: { left: 'Only header' } } }
		});
		expect(asLatin1(out)).toContain('Only header');
	});
});
