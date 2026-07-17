import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState } from './types';

const xml = () => new TextEncoder().encode('<invoice/>');

async function namesOf(bytes: Uint8Array): Promise<string[]> {
	const doc = await PdfDocument.load(bytes);
	return (await doc.getAttachments()).map((a) => a.name).sort();
}

// A one-page source PDF to exercise the source paths.
async function sourcePdf(): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	doc.addPage([200, 200]);
	return doc.save();
}

describe('attachments export', () => {
	it('embeds an attachment on the blank rebuild path', async () => {
		const state: EditState = {
			pageSize: [200, 200],
			elements: [],
			attachments: [{ id: 'a1', name: 'data.xml', bytes: xml(), mimeType: 'text/xml' }]
		};
		expect(await namesOf(await buildPdf(state))).toEqual(['data.xml']);
	});

	it('adds only NEW attachments on the incremental path, keeping source ones', async () => {
		// Source already carries keep.xml.
		const src = await PdfDocument.load(await sourcePdf());
		src.attach(xml(), 'keep.xml');
		const withAttachment = await src.save();

		const state: EditState = {
			pageSize: [200, 200],
			elements: [],
			sources: [withAttachment],
			sourceAttachmentNames: ['keep.xml'],
			attachments: [
				{ id: 'a1', name: 'keep.xml', bytes: xml() }, // unchanged source one
				{ id: 'a2', name: 'added.xml', bytes: xml() } // new
			]
		};
		// No source-field changes / rotation / objectStreams => incremental path.
		expect(await namesOf(await buildPdf(state))).toEqual(['added.xml', 'keep.xml']);
	});

	it('re-attaches survivors via rebuild when a source attachment is removed', async () => {
		const src = await PdfDocument.load(await sourcePdf());
		src.attach(xml(), 'drop.xml');
		src.attach(xml(), 'keep.xml');
		const withAttachments = await src.save();

		const state: EditState = {
			pageSize: [200, 200],
			elements: [],
			sources: [withAttachments],
			sourceAttachmentNames: ['drop.xml', 'keep.xml'],
			attachments: [{ id: 'a1', name: 'keep.xml', bytes: xml() }] // drop.xml removed
		};
		// attachment-removed => rebuild => fresh doc gets only keep.xml.
		expect(await namesOf(await buildPdf(state))).toEqual(['keep.xml']);
	});
});
