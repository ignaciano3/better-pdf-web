import { describe, it, expect } from 'vitest';
import { mapFields, fieldInfoToElement, type FieldInfoLike } from './extract-fields';

function info(over: Partial<FieldInfoLike>): FieldInfoLike {
	return {
		name: 'f',
		type: 'text',
		value: null,
		states: [],
		options: [],
		readOnly: false,
		required: false,
		maxLength: null,
		multiSelect: false,
		widgets: [{ page: 0, rect: [10, 10, 110, 30] }],
		...over
	};
}

describe('extract-fields mapper', () => {
	const pageHeights = [400, 400];

	it('maps a text field with its rect flipped to top-left', () => {
		const el = fieldInfoToElement(info({ name: 'name', value: 'Ada' }), pageHeights, 'field0');
		expect(el).not.toBeNull();
		expect(el!.field).toBe('text');
		expect(el!.name).toBe('name');
		expect(el!.x).toBe(10);
		expect(el!.y).toBe(400 - 30); // top edge from rect y1=30
		expect(el!.width).toBe(100);
		expect(el!.height).toBe(20);
		expect(el!.value).toBe('Ada');
		expect(el!.page).toBe(0);
	});

	it('carries required, readOnly, options, maxLength', () => {
		const el = fieldInfoToElement(
			info({
				name: 'country',
				type: 'dropdown',
				options: ['AR', 'US'],
				required: true,
				readOnly: true
			}),
			pageHeights,
			'field0'
		);
		expect(el!.field).toBe('dropdown');
		expect(el!.required).toBe(true);
		expect(el!.readOnly).toBe(true);
		expect(el!.options).toEqual(['AR', 'US']);
	});

	it('keeps multiSelect listboxes as listbox', () => {
		const el = fieldInfoToElement(
			info({ name: 'langs', type: 'listbox', multiSelect: true, options: ['a', 'b'] }),
			pageHeights,
			'field0'
		);
		expect(el!.field).toBe('listbox');
	});

	it('only carries maxLength for text fields', () => {
		const text = fieldInfoToElement(info({ type: 'text', maxLength: 12 }), pageHeights, 'field0');
		expect(text!.maxLength).toBe(12);
		const dd = fieldInfoToElement(
			info({ type: 'dropdown', maxLength: 12, options: ['a'] }),
			pageHeights,
			'field0'
		);
		expect(dd!.maxLength).toBeUndefined();
	});

	it('loads a radio group: options from states, per-widget radioLayout', () => {
		const el = fieldInfoToElement(
			info({
				name: 'diabetes.tipo',
				type: 'radio',
				value: 'Off',
				states: ['1', '2'],
				options: [],
				widgets: [
					{ page: 0, rect: [130.3, 613.7, 139.3, 622.7] },
					{ page: 0, rect: [203.1, 613.7, 212.1, 622.7] }
				]
			}),
			pageHeights,
			'field0'
		);
		expect(el).not.toBeNull();
		expect(el!.field).toBe('radio');
		// Options come from `states` (radio leaves `options` empty).
		expect(el!.options).toEqual(['1', '2']);
		// One radioLayout entry per widget, top-left flipped, index-aligned.
		expect(el!.radioLayout).toEqual([
			{ x: 130.3, y: 400 - 622.7 },
			{ x: 203.1, y: 400 - 622.7 }
		]);
		// "Off" is the unselected sentinel, not a real selection.
		expect(el!.value).toBeUndefined();
	});

	it('skips pushbutton and unknown types', () => {
		expect(fieldInfoToElement(info({ type: 'pushbutton' }), pageHeights, 'field0')).toBeNull();
		expect(fieldInfoToElement(info({ type: 'unknown' }), pageHeights, 'field0')).toBeNull();
	});

	it('skips fields with no widget', () => {
		expect(fieldInfoToElement(info({ widgets: [] }), pageHeights, 'field0')).toBeNull();
	});

	it('mapFields assigns sequential ids and skips unsupported', () => {
		const els = mapFields(
			[info({ name: 'a' }), info({ name: 'btn', type: 'pushbutton' }), info({ name: 'b' })],
			pageHeights
		);
		expect(els.map((e) => e.name)).toEqual(['a', 'b']);
		expect(els.map((e) => e.id)).toEqual(['field0', 'field1']);
	});
});
