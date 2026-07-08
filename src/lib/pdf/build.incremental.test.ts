import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState, FieldElement } from './types';

function field(over: Partial<FieldElement> & Pick<FieldElement, 'field' | 'name'>): FieldElement {
	return {
		type: 'field',
		id: over.name,
		x: 20,
		y: 20,
		width: 120,
		height: 22,
		page: 0,
		...over
	};
}

/** A one-page source PDF containing a text field `existing` (value "orig"). */
async function makeSource(): Promise<Uint8Array> {
	const doc = await PdfDocument.create();
	doc.addPage([400, 500]);
	const form = doc.createForm();
	form.addTextField('existing', { page: 0, x: 20, y: 400, width: 120, height: 22, value: 'orig' });
	return doc.save();
}

/** Snapshot matching what the editor would hold for the source field. The
 *  incremental path only compares elements against this snapshot; exact
 *  coordinates don't matter as long as element and snapshot agree. */
const SNAP = field({ field: 'text', name: 'existing', value: 'orig', y: 78 });

describe('buildPdf incremental path', () => {
	it('appends a new field while preserving the existing one (no re-author)', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [SNAP, field({ field: 'text', name: 'added', value: 'hi', y: 120 })]
		};
		const bytes = await buildPdf(state);

		// Incremental saves are append-only: the original bytes are a prefix.
		expect(bytes.byteLength).toBeGreaterThan(source.byteLength);
		expect(Array.from(bytes.slice(0, source.byteLength))).toEqual(Array.from(source));

		const doc = await PdfDocument.load(bytes);
		const fields = doc.getForm().getFields();
		const names = fields.map((f) => f.name).sort();
		expect(names).toEqual(['added', 'existing']); // exactly one copy of each
		expect(fields.find((f) => f.name === 'existing')?.value).toBe('orig');
		expect(fields.find((f) => f.name === 'added')?.value).toBe('hi');
	});

	it('fills a value-only change on a source field', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [{ ...SNAP, value: 'updated' }]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		// getTextField() wraps { info, queue } without proxying `.value` — only
		// getField()/getFields() expose the parsed value; see build.ts's fillField.
		expect(doc.getForm().getField('existing')?.value).toBe('updated');
	});

	it('falls back to rebuild on structural change (source field dropped, edited copy authored)', async () => {
		const source = await makeSource();
		const moved = { ...SNAP, x: 200 };
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [moved]
		};
		const bytes = await buildPdf(state);
		// Rebuild output is NOT an append of the source.
		expect(Array.from(bytes.slice(0, source.byteLength))).not.toEqual(Array.from(source));
		const doc = await PdfDocument.load(bytes);
		const fields = doc.getForm().getFields();
		expect(fields.map((f) => f.name)).toEqual(['existing']); // re-authored once
	});

	it('flatten on incremental bakes both original and new fields', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [SNAP, field({ field: 'text', name: 'added', value: 'hi', y: 120 })],
			flatten: true
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getForm().getFields().length).toBe(0);
	});

	it('stamps text elements and applies metadata incrementally', async () => {
		const source = await makeSource();
		const state: EditState = {
			pageSize: [400, 500],
			sources: [source],
			sourceFields: [SNAP],
			elements: [
				SNAP,
				{ type: 'text', id: 't1', x: 30, y: 30, page: 0, text: 'stamped', size: 14 }
			],
			metadata: { title: 'Inc Title' }
		};
		const bytes = await buildPdf(state);
		expect(Array.from(bytes.slice(0, source.byteLength))).toEqual(Array.from(source));
		const doc = await PdfDocument.load(bytes);
		const meta = await doc.getMetadata();
		expect(meta.title).toBe('Inc Title');
	});
});
