import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { extractAttachmentsFromBytes } from './extract-attachments-client';

describe('extractAttachmentsFromBytes', () => {
	it('reads embedded files back with a fresh id each', async () => {
		const doc = await PdfDocument.create();
		doc.addPage([200, 200]);
		doc.attach(new TextEncoder().encode('<x/>'), 'data.xml', { mimeType: 'text/xml' });
		const bytes = await doc.save();

		let n = 0;
		const atts = await extractAttachmentsFromBytes(bytes, () => `att${n++}`);
		expect(atts).toHaveLength(1);
		expect(atts[0]!).toMatchObject({ id: 'att0', name: 'data.xml', mimeType: 'text/xml' });
		expect(atts[0]!.bytes).toBeInstanceOf(Uint8Array);
	});

	it('returns an empty list for a PDF with no attachments', async () => {
		const doc = await PdfDocument.create();
		doc.addPage([200, 200]);
		const atts = await extractAttachmentsFromBytes(await doc.save(), () => 'x');
		expect(atts).toEqual([]);
	});
});
