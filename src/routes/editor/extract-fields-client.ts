import { PdfDocument } from '@ignaciano3/better-pdf';
import type { FieldElement } from '$lib/pdf/types';
import { mapFields, type FieldInfoLike, type ExtractFieldsResult } from './extract-fields';

export type { ExtractFieldsResult };

/**
 * Read AcroForm fields from uploaded PDF bytes, entirely in the browser (the
 * WASM build initializes on first `PdfDocument.load`). Bytes never leave the
 * device. On any failure (corrupt / encrypted / XFA) returns empty results so
 * the editor still opens for stamping — no fields surfaced.
 */
export async function extractFieldsFromBytes(bytes: Uint8Array): Promise<ExtractFieldsResult> {
	if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
		return { fields: [], pageHeights: [], allNames: [] };
	}
	try {
		const doc = await PdfDocument.load(bytes);
		const pageHeights = doc.getPages().map((p) => p.height);
		const infos = doc.getForm().getFields() as unknown as FieldInfoLike[];
		const fields = mapFields(infos, pageHeights) as FieldElement[];
		const allNames = infos.map((i) => i.name);
		return { fields, pageHeights, allNames };
	} catch (error) {
		console.error('Error extracting fields:', error);
		return { fields: [], pageHeights: [], allNames: [] };
	}
}
