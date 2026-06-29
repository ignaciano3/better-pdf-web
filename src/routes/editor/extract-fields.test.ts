import { describe, it, expect } from 'vitest';
import {
	mapFields,
	fieldInfoToElement,
	resourceFontToStandard,
	type FieldInfoLike
} from './extract-fields';

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
		defaultValue: null,
		password: false,
		multiline: false,
		comb: false,
		editable: false,
		align: 'left',
		tooltip: null,
		fontSize: null,
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

	it('maps a multi-select listbox to multiSelect + selectedValues (valid options only)', () => {
		const el = fieldInfoToElement(
			info({
				name: 'langs',
				type: 'listbox',
				multiSelect: true,
				options: ['a', 'b', 'c'],
				value: 'a,c,zzz'
			}),
			pageHeights,
			'field0'
		);
		expect(el!.field).toBe('listbox');
		expect(el!.multiSelect).toBe(true);
		expect(el!.selectedValues).toEqual(['a', 'c']); // 'zzz' dropped (not an option)
		expect(el!.value).toBeUndefined(); // single value not set for multi-select
	});

	it('leaves a single-select listbox using the single value', () => {
		const el = fieldInfoToElement(
			info({ name: 'lang', type: 'listbox', multiSelect: false, options: ['a', 'b'], value: 'b' }),
			pageHeights,
			'field0'
		);
		expect(el!.field).toBe('listbox');
		expect(el!.multiSelect).toBeUndefined();
		expect(el!.value).toBe('b');
		expect(el!.selectedValues).toBeUndefined();
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

	it('carries tooltip, align, fontSize, and text flags on import', () => {
		const el = fieldInfoToElement(
			info({
				name: 'notes',
				type: 'text',
				maxLength: 6,
				multiline: true,
				comb: false,
				password: true,
				align: 'center',
				fontSize: 14,
				tooltip: 'help'
			}),
			pageHeights,
			'field0'
		);
		expect(el!.tooltip).toBe('help');
		expect(el!.align).toBe('center');
		expect(el!.fontSize).toBe(14);
		expect(el!.multiline).toBe(true);
		expect(el!.password).toBe(true);
	});

	it('maps a non-default field font abbreviation on import; drops Helvetica', () => {
		const timesEl = fieldInfoToElement(
			info({ type: 'text', fontName: 'TiBo' }),
			pageHeights,
			'field0'
		);
		expect(timesEl!.font).toBe('Times-Bold');
		// Helvetica is the lib default — not carried, so a re-author stays minimal.
		const helvEl = fieldInfoToElement(
			info({ type: 'text', fontName: 'Helv' }),
			pageHeights,
			'field0'
		);
		expect(helvEl!.font).toBeUndefined();
		// Unknown/embedded font name → no standard font.
		const embeddedEl = fieldInfoToElement(
			info({ type: 'text', fontName: 'Arial' }),
			pageHeights,
			'field0'
		);
		expect(embeddedEl!.font).toBeUndefined();
	});

	it('resourceFontToStandard maps abbreviations and full names', () => {
		expect(resourceFontToStandard('HeBo')).toBe('Helvetica-Bold');
		expect(resourceFontToStandard('Times-Italic')).toBe('Times-Italic');
		expect(resourceFontToStandard('Cour')).toBe('Courier');
		expect(resourceFontToStandard(null)).toBeNull();
		expect(resourceFontToStandard('Wingdings')).toBeNull();
	});

	it('maps an editable dropdown to a combo field', () => {
		const el = fieldInfoToElement(
			info({ name: 'city', type: 'dropdown', editable: true, options: ['BA', 'NY'] }),
			pageHeights,
			'field0'
		);
		expect(el!.field).toBe('combo');
	});

	it('imports /DV defaults per field type', () => {
		const text = fieldInfoToElement(
			info({ name: 't', type: 'text', defaultValue: 'hi' }),
			pageHeights,
			'field0'
		);
		expect(text!.defaultValue).toBe('hi');
		const dd = fieldInfoToElement(
			info({ name: 'd', type: 'dropdown', options: ['a', 'b'], defaultValue: 'b' }),
			pageHeights,
			'field0'
		);
		expect(dd!.defaultSelected).toBe('b');
		const cb = fieldInfoToElement(
			info({ name: 'c', type: 'checkbox', defaultValue: 'Yes' }),
			pageHeights,
			'field0'
		);
		expect(cb!.defaultChecked).toBe(true);
	});

	it('ignores a /DV default-selected that is not an option', () => {
		const dd = fieldInfoToElement(
			info({ name: 'd', type: 'dropdown', options: ['a'], defaultValue: 'zzz' }),
			pageHeights,
			'field0'
		);
		expect(dd!.defaultSelected).toBeUndefined();
	});

	it('skips fields whose first widget is hidden or no-view', () => {
		expect(
			fieldInfoToElement(
				info({ widgets: [{ page: 0, rect: [10, 10, 110, 30], hidden: true }] }),
				pageHeights,
				'field0'
			)
		).toBeNull();
		expect(
			fieldInfoToElement(
				info({ widgets: [{ page: 0, rect: [10, 10, 110, 30], noView: true }] }),
				pageHeights,
				'field0'
			)
		).toBeNull();
	});
});
