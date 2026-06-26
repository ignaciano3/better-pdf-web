import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState, FieldElement } from './types';

const A4: [number, number] = [595.28, 841.89];

function textField(): FieldElement {
	return {
		type: 'field',
		id: 'f1',
		field: 'text',
		name: 'applicant',
		x: 50,
		y: 50,
		width: 200,
		height: 24,
		page: 0
	};
}

async function fieldCount(bytes: Uint8Array): Promise<number> {
	const doc = await PdfDocument.load(bytes);
	return doc.getForm().getFields().length;
}

describe('buildPdf flatten', () => {
	it('keeps fields interactive when flatten is unset', async () => {
		const state: EditState = { pageSize: A4, elements: [textField()] };
		expect(await fieldCount(await buildPdf(state))).toBe(1);
	});

	it('removes all fields when flatten is true', async () => {
		const state: EditState = { pageSize: A4, elements: [textField()], flatten: true };
		expect(await fieldCount(await buildPdf(state))).toBe(0);
	});

	it('is a no-op when there are no fields', async () => {
		const state: EditState = { pageSize: A4, elements: [], flatten: true };
		const bytes = await buildPdf(state);
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
	});
});
