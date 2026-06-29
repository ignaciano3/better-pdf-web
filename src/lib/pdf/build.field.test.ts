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

	it('places each radio button at its own radioLayout position (#3)', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({
					field: 'radio',
					name: 'pick',
					width: 18,
					height: 18,
					options: ['a', 'b'],
					// One stacked at top-left, the other moved far to the right.
					radioLayout: [
						{ x: 50, y: 50 },
						{ x: 200, y: 300 }
					]
				})
			]
		};

		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const radio = doc
			.getForm()
			.getFields()
			.find((f) => f.name === 'pick');
		expect(radio?.type).toBe('radio');
		expect(radio?.widgets).toHaveLength(2);

		// rect = [x1, y1, x2, y2] in PDF (bottom-left origin); y flips from top-left.
		const corners = radio!.widgets.map((wg) => [Math.round(wg.rect[0]), Math.round(wg.rect[1])]);
		expect(corners).toEqual(
			expect.arrayContaining([
				[50, 500 - 50 - 18], // a → y 432
				[200, 500 - 300 - 18] // b → y 182
			])
		);
	});

	it('authors a radio with border + background without dropping widgets (#1)', async () => {
		// The reader API exposes no widget appearance (border/bg colors), so we
		// can't assert the colors round-trip. This guards the build.ts radio case
		// from regressing when the appearance props are present: it must still
		// author both widgets rather than throwing or collapsing the group.
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({
					field: 'radio',
					name: 'pick',
					width: 18,
					height: 18,
					options: ['a', 'b'],
					radioLayout: [
						{ x: 50, y: 50 },
						{ x: 50, y: 80 }
					],
					border: { color: { r: 0, g: 0, b: 1 }, width: 2 },
					background: { r: 0.9, g: 0.9, b: 0.9 }
				})
			]
		};

		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const radio = doc
			.getForm()
			.getFields()
			.find((f) => f.name === 'pick');
		expect(radio?.type).toBe('radio');
		expect(radio?.widgets).toHaveLength(2);
		expect(radio?.states).toEqual(expect.arrayContaining(['a', 'b']));
	});

	it('authors password + reset defaults that round-trip on re-load', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({
					field: 'text',
					name: 'pin',
					password: true,
					maxLength: 4,
					value: '1234',
					defaultValue: '0000'
				}),
				field({ field: 'checkbox', name: 'agree', x: 20, y: 60, defaultChecked: true }),
				field({
					field: 'dropdown',
					name: 'country',
					x: 20,
					y: 100,
					options: ['AR', 'US'],
					defaultSelected: 'AR'
				})
			]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const byName = Object.fromEntries(
			doc
				.getForm()
				.getFields()
				.map((f) => [f.name, f])
		);
		expect(byName['pin']?.password).toBe(true);
		expect(byName['pin']?.defaultValue).toBe('0000');
		expect(byName['country']?.defaultValue).toBe('AR');
		// checkbox /DV is an on-state string (non-null) when defaultChecked.
		expect(byName['agree']?.defaultValue).not.toBeNull();
	});

	it('drops an over-long text default and a default-selected not in options', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({ field: 'text', name: 'short', maxLength: 2, defaultValue: 'toolong' }),
				field({
					field: 'dropdown',
					name: 'pick',
					x: 20,
					y: 80,
					options: ['a', 'b'],
					defaultSelected: 'zzz'
				})
			]
		};
		// Must not throw, and the invalid defaults must be absent.
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const byName = Object.fromEntries(
			doc
				.getForm()
				.getFields()
				.map((f) => [f.name, f])
		);
		expect(byName['short']?.defaultValue).toBeNull();
		expect(byName['pick']?.defaultValue).toBeNull();
	});

	it('authors an editable combo with a free-text value + default not in its options', async () => {
		// An editable combo (e.g. imported from a PDF whose /V is a typed value
		// outside /Opt) must not crash export. The builder validates
		// selected/defaultSelected against options, so the free-text entries are
		// folded into the option list.
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({
					field: 'combo',
					name: 'city',
					options: ['BA', 'NY'],
					value: 'Rosario',
					defaultSelected: 'Cordoba'
				})
			]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const f = doc.getForm().getField('city');
		expect(f?.type).toBe('dropdown'); // combo authors as an editable dropdown
		expect(f?.value).toBe('Rosario');
		expect(f?.defaultValue).toBe('Cordoba');
		expect(f?.options).toEqual(expect.arrayContaining(['BA', 'NY', 'Rosario', 'Cordoba']));
	});

	it('still drops an out-of-options value/default for a plain (non-editable) dropdown', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({
					field: 'dropdown',
					name: 'plain',
					options: ['a', 'b'],
					defaultSelected: 'zzz'
				})
			]
		};
		// Plain dropdown is not editable: free-text is invalid, so the default is
		// dropped (not folded into options). Export must not throw.
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const f = doc.getForm().getField('plain');
		expect(f?.options).toEqual(expect.arrayContaining(['a', 'b']));
		expect(f?.options).not.toContain('zzz');
		expect(f?.defaultValue).toBeNull();
	});

	it('authors a multi-select listbox whose initial values round-trip', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			elements: [
				field({
					field: 'listbox',
					name: 'langs',
					x: 20,
					y: 150,
					height: 60,
					options: ['ts', 'rs', 'py'],
					multiSelect: true,
					selectedValues: ['ts', 'py', 'zzz'] // 'zzz' is not an option → dropped
				})
			]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		const f = doc.getForm().getField('langs');
		expect(f?.type).toBe('listbox');
		expect(f?.multiSelect).toBe(true);
		// The reader renders the /V array as a comma-joined string.
		const selected = (f?.value ?? '').split(',').filter(Boolean).map((s) => s.trim());
		expect(selected).toEqual(expect.arrayContaining(['ts', 'py']));
		expect(selected).not.toContain('zzz');
	});

	it('flatten still works for a multi-select listbox', async () => {
		const state: EditState = {
			pageSize: [400, 500],
			flatten: true,
			elements: [
				field({
					field: 'listbox',
					name: 'langs',
					x: 20,
					y: 150,
					height: 60,
					options: ['ts', 'rs'],
					multiSelect: true,
					selectedValues: ['ts', 'rs']
				})
			]
		};
		const bytes = await buildPdf(state);
		const doc = await PdfDocument.load(bytes);
		// Flattened → no interactive fields remain.
		expect(doc.getForm().getFields().length).toBe(0);
	});
});
