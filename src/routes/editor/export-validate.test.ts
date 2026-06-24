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
});
