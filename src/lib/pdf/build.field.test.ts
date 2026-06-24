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

describe('buildPdf field authoring (D3 rebuild)', () => {
	it('authors fields on a blank doc that round-trip on re-load', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({ field: 'text', name: 'fullName', value: 'Ada Lovelace' }),
				field({
					field: 'checkbox',
					name: 'agree',
					x: 20,
					y: 60,
					width: 16,
					height: 16,
					value: 'Yes'
				}),
				field({
					field: 'dropdown',
					name: 'country',
					x: 20,
					y: 100,
					options: ['AR', 'US', 'UK'],
					value: 'US'
				}),
				field({
					field: 'listbox',
					name: 'langs',
					x: 20,
					y: 150,
					height: 60,
					options: ['ts', 'rs', 'py']
				}),
				field({ field: 'combo', name: 'city', x: 20, y: 230, options: ['BA', 'NY'] }),
				field({ field: 'signature', name: 'sign', x: 20, y: 280, width: 150, height: 50 })
			]
		};

		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const fields = doc.getForm().getFields();
		const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

		expect(byName['fullName']?.type).toBe('text');
		expect(byName['fullName']?.value).toBe('Ada Lovelace');
		expect(byName['agree']?.type).toBe('checkbox');
		expect(byName['country']?.type).toBe('dropdown');
		expect(byName['country']?.options).toEqual(expect.arrayContaining(['AR', 'US', 'UK']));
		expect(byName['langs']?.type).toBe('listbox');
		expect(byName['city']?.type).toBe('dropdown'); // combo authors as dropdown
		expect(byName['sign']?.type).toBe('signature');
	});

	it('preserves appearance props (required/readOnly/maxLength) through export', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({
					field: 'text',
					name: 'code',
					required: true,
					readOnly: true,
					maxLength: 8,
					tooltip: 'enter code',
					border: { color: { r: 0, g: 0, b: 1 }, width: 2 },
					background: { r: 0.9, g: 0.9, b: 0.9 }
				})
			]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const f = doc.getForm().getField('code');
		expect(f?.required).toBe(true);
		expect(f?.readOnly).toBe(true);
		expect(f?.maxLength).toBe(8);
	});

	it('round-trips fields placed over an embedded source page', async () => {
		// Build a 1-page source PDF.
		const src = await PdfDocument.create();
		src.addPage([400, 500]);
		const sourcePdf = await src.save();

		const state: EditState = {
			pageSize: [400, 500],
			sourcePdf,
			elements: [field({ field: 'text', name: 'onSource', value: 'hi' })]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		expect(doc.getPageCount()).toBe(1);
		const f = doc.getForm().getField('onSource');
		expect(f?.type).toBe('text');
		expect(f?.value).toBe('hi');
	});

	it('does not double widgets when re-exporting a source that already had fields', async () => {
		// Source with one existing field.
		const src = await PdfDocument.create();
		src.addPage([400, 500]);
		src.createForm().addTextField('existing', {
			page: 0,
			x: 10,
			y: 10,
			width: 100,
			height: 20
		});
		const sourcePdf = await src.save();

		// Re-detect would seed 'existing'; here we simulate re-authoring it once.
		const state: EditState = {
			pageSize: [400, 500],
			sourcePdf,
			elements: [field({ field: 'text', name: 'existing', value: 'v' })]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const named = doc
			.getForm()
			.getFields()
			.filter((f) => f.name === 'existing');
		expect(named.length).toBe(1);
	});
});
