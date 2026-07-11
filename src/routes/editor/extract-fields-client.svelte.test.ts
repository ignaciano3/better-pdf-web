import { describe, it, expect, vi } from 'vitest';

// Mock the browser WASM package: never load real WASM in jsdom. `load` returns a
// fake document whose form yields one text field on a single 800pt-high page.
const getFields = vi.fn(() => [
	{
		name: 'person.name',
		type: 'text',
		options: [],
		widgets: [{ page: 0, rect: [100, 700, 300, 720] }]
	}
]);
vi.mock('@ignaciano3/better-pdf', () => ({
	PdfDocument: {
		load: vi.fn(async () => ({
			getPages: () => [{ height: 800 }],
			getForm: () => ({ getFields })
		}))
	}
}));

import { extractFieldsFromBytes } from './extract-fields-client';

describe('extractFieldsFromBytes', () => {
	it('maps AcroForm fields, page heights, and raw names', async () => {
		const res = await extractFieldsFromBytes(new Uint8Array([1, 2, 3]));
		expect(res.pageHeights).toEqual([800]);
		expect(res.allNames).toEqual(['person.name']);
		expect(res.fields.length).toBe(1);
	});

	it('returns empty results on empty input', async () => {
		const res = await extractFieldsFromBytes(new Uint8Array());
		expect(res).toEqual({ fields: [], pageHeights: [], allNames: [] });
	});

	it('returns empty results when load throws (corrupt/encrypted/XFA)', async () => {
		const { PdfDocument } = await import('@ignaciano3/better-pdf');
		vi.mocked(PdfDocument.load).mockRejectedValueOnce(new Error('encrypted'));
		const res = await extractFieldsFromBytes(new Uint8Array([9]));
		expect(res).toEqual({ fields: [], pageHeights: [], allNames: [] });
	});
});
