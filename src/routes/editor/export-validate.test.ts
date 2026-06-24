import { describe, it, expect } from 'vitest';
import { validateExportInput } from './export-validate';

describe('validateExportInput', () => {
	it('accepts a rich text element', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [
					{
						type: 'text',
						id: 't0',
						text: 'hi',
						x: 1,
						y: 2,
						size: 12,
						font: 'Times-Bold',
						opacity: 0.5,
						rotation: 10,
						lineHeight: 14,
						maxWidth: 100
					}
				]
			}
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects a non-finite opacity', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [{ type: 'text', id: 't0', text: 'hi', x: 1, y: 2, size: 12, opacity: Infinity }]
			}
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	function fieldInput(over: Record<string, unknown>) {
		return {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [
					{
						type: 'field',
						id: 'f0',
						field: 'text',
						name: 'name',
						x: 1,
						y: 2,
						width: 100,
						height: 20,
						...over
					}
				]
			}
		};
	}

	it('accepts a valid field element (all kinds, options, border)', () => {
		expect(() =>
			validateExportInput(
				fieldInput({
					field: 'dropdown',
					options: ['a', 'b'],
					required: true,
					readOnly: true,
					tooltip: 'x',
					border: { color: { r: 0, g: 0, b: 1 }, width: 1 },
					background: { r: 1, g: 1, b: 1 },
					value: 'a'
				})
			)
		).not.toThrow();
	});

	it('rejects a field with non-finite geometry', () => {
		expect(() => validateExportInput(fieldInput({ width: Infinity }))).toThrow();
	});

	it('rejects an unknown field kind', () => {
		expect(() => validateExportInput(fieldInput({ field: 'bogus' }))).toThrow();
	});

	it('rejects an empty field name', () => {
		expect(() => validateExportInput(fieldInput({ name: '' }))).toThrow();
	});

	it('rejects non-string options', () => {
		expect(() => validateExportInput(fieldInput({ options: [1, 2] }))).toThrow();
	});

	function elementInput(el: Record<string, unknown>) {
		return { fingerprint: 'fp', state: { pageSize: [300, 400], elements: [el] } };
	}

	it('accepts a path element', () => {
		expect(() =>
			validateExportInput(
				elementInput({
					type: 'path',
					id: 'p0',
					x: 1,
					y: 2,
					points: [{ x: 1, y: 2 }],
					strokeWidth: 2,
					opacity: 0.5
				})
			)
		).not.toThrow();
	});

	it('accepts a polygon element', () => {
		expect(() =>
			validateExportInput(
				elementInput({
					type: 'polygon',
					id: 'pg0',
					x: 1,
					y: 2,
					points: [
						{ x: 1, y: 2 },
						{ x: 3, y: 4 }
					]
				})
			)
		).not.toThrow();
	});

	it('rejects a polygon with a non-finite point', () => {
		expect(() =>
			validateExportInput(
				elementInput({
					type: 'polygon',
					id: 'pg0',
					x: 1,
					y: 2,
					points: [
						{ x: 1, y: 2 },
						{ x: Infinity, y: 4 }
					]
				})
			)
		).toThrow();
	});

	it('rejects a polygon with fewer than 2 points', () => {
		expect(() =>
			validateExportInput(
				elementInput({ type: 'polygon', id: 'pg0', x: 1, y: 2, points: [{ x: 1, y: 2 }] })
			)
		).toThrow();
	});

	it('accepts a link with a url', () => {
		expect(() =>
			validateExportInput(
				elementInput({
					type: 'link',
					id: 'l0',
					x: 1,
					y: 2,
					width: 100,
					height: 20,
					url: 'https://example.com'
				})
			)
		).not.toThrow();
	});

	it('accepts a link with a goToPage', () => {
		expect(() =>
			validateExportInput(
				elementInput({ type: 'link', id: 'l0', x: 1, y: 2, width: 100, height: 20, goToPage: 1 })
			)
		).not.toThrow();
	});

	it('rejects a link with both url and goToPage', () => {
		expect(() =>
			validateExportInput(
				elementInput({
					type: 'link',
					id: 'l0',
					x: 1,
					y: 2,
					width: 100,
					height: 20,
					url: 'https://x.test',
					goToPage: 1
				})
			)
		).toThrow();
	});

	it('rejects a link with neither url nor goToPage', () => {
		expect(() =>
			validateExportInput(
				elementInput({ type: 'link', id: 'l0', x: 1, y: 2, width: 100, height: 20 })
			)
		).toThrow();
	});

	it('accepts a text element with a fontId', () => {
		expect(() =>
			validateExportInput(
				elementInput({ type: 'text', id: 't0', text: 'hi', x: 1, y: 2, size: 12, fontId: 'f1' })
			)
		).not.toThrow();
	});

	it('accepts state.fonts and validates each asset', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				fonts: [{ id: 'f1', name: 'a.ttf', bytes: new Uint8Array([1, 2, 3]) }]
			}
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects a font asset with non-Uint8Array bytes', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				fonts: [{ id: 'f1', name: 'a.ttf', bytes: [1, 2, 3] }]
			}
		};
		expect(() => validateExportInput(input)).toThrow();
	});
});
