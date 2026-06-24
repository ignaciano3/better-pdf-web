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
});
