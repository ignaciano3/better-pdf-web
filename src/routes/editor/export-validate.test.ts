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

	// --- PR4 -----------------------------------------------------------------

	it('accepts a multi-source sources array', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				sources: [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
			}
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects sources with a non-Uint8Array entry', () => {
		const input = {
			fingerprint: 'fp',
			state: { pageSize: [300, 400], elements: [], sources: [new Uint8Array([1]), [3, 4]] }
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('accepts a source pageOp with size and docIndex', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				sources: [new Uint8Array([1]), new Uint8Array([2])],
				pageOps: [{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 1, size: [612, 792] }]
			}
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects a source pageOp docIndex out of range', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				sources: [new Uint8Array([1])],
				pageOps: [{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 5 }]
			}
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('rejects a source pageOp with a non-finite size', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				sourcePdf: new Uint8Array([1]),
				pageOps: [{ kind: 'source', sourceIndex: 0, rotation: 0, size: [Infinity, 100] }]
			}
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('accepts metadata with strings and keywords', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				metadata: { title: 'T', author: 'A', keywords: ['x', 'y'] }
			}
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects metadata with a non-string title', () => {
		const input = {
			fingerprint: 'fp',
			state: { pageSize: [300, 400], elements: [], metadata: { title: 5 } }
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('rejects metadata keywords that are not all strings', () => {
		const input = {
			fingerprint: 'fp',
			state: { pageSize: [300, 400], elements: [], metadata: { keywords: ['x', 7] } }
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('accepts a multi-select listbox field', () => {
		expect(() =>
			validateExportInput(
				fieldInput({
					field: 'listbox',
					options: ['a', 'b'],
					multiSelect: true,
					selectedValues: ['a', 'b']
				})
			)
		).not.toThrow();
	});

	it('rejects a non-array selectedValues', () => {
		expect(() =>
			validateExportInput(
				fieldInput({
					field: 'listbox',
					options: ['a'],
					multiSelect: true,
					selectedValues: 'a'
				})
			)
		).toThrow();
	});

	it('accepts a valid outline with nesting', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				pageOps: [
					{ kind: 'blank', size: [300, 400], rotation: 0 },
					{ kind: 'blank', size: [300, 400], rotation: 0 }
				],
				outline: [{ title: 'A', page: 0, children: [{ title: 'A.1', page: 1 }] }]
			}
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects an outline page index out of range', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				pageOps: [{ kind: 'blank', size: [300, 400], rotation: 0 }],
				outline: [{ title: 'A', page: 9 }]
			}
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('rejects an outline entry with a non-string title', () => {
		const input = {
			fingerprint: 'fp',
			state: {
				pageSize: [300, 400],
				elements: [],
				pageOps: [{ kind: 'blank', size: [300, 400], rotation: 0 }],
				outline: [{ title: 123, page: 0 }]
			}
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('accepts a boolean flatten flag', () => {
		const input = {
			state: { pageSize: [595, 842], elements: [], flatten: true },
			fingerprint: 'fp'
		};
		expect(() => validateExportInput(input)).not.toThrow();
	});

	it('rejects a non-boolean flatten flag', () => {
		const input = {
			state: { pageSize: [595, 842], elements: [], flatten: 'yes' },
			fingerprint: 'fp'
		};
		expect(() => validateExportInput(input)).toThrow();
	});

	it('rejects a non-boolean objectStreams flag', () => {
		const input = { fingerprint: 'fp', state: { pageSize: [300, 400], elements: [], objectStreams: 'yes' } };
		expect(() => validateExportInput(input)).toThrow();
	});

	it('accepts a boolean objectStreams flag', () => {
		const input = { fingerprint: 'fp', state: { pageSize: [300, 400], elements: [], objectStreams: true } };
		expect(() => validateExportInput(input)).not.toThrow();
	});

	// --- watermark validation tests ---

	const wmInput = (wm: unknown) => ({
		state: { pageSize: [595, 842], elements: [], watermark: wm },
		fingerprint: 'fp'
	});

	it('accepts a valid watermark', () => {
		expect(() =>
			validateExportInput(wmInput({ text: 'DRAFT', size: 48, opacity: 0.3, rotation: 45 }))
		).not.toThrow();
	});

	it('rejects a watermark with non-string text', () => {
		expect(() => validateExportInput(wmInput({ text: 123 }))).toThrow();
	});

	it('rejects a watermark with out-of-range opacity', () => {
		expect(() => validateExportInput(wmInput({ text: 'X', opacity: 5 }))).toThrow();
	});

	it('rejects a watermark with an unknown font', () => {
		expect(() => validateExportInput(wmInput({ text: 'X', font: 'Comic Sans' }))).toThrow();
	});
});
