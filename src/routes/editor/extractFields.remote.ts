import { command } from '$app/server';
import { PdfDocument } from '@ignaciano3/better-pdf';
import type { FieldElement } from '$lib/pdf/types';
import { mapFields, type FieldInfoLike } from './extract-fields';

/** Result of reading the AcroForm fields out of an uploaded PDF. */
export interface ExtractFieldsResult {
	/** Detected fields as editor elements (top-left coords). */
	fields: FieldElement[];
	/** Per-page heights in PDF points, indexed by page. */
	pageHeights: number[];
	/** Every raw AcroForm field name in the document, including fields the
	 *  mapper skips (hidden widgets, pushbuttons, unknown types). Drives
	 *  editor-side collision validation for the incremental export. */
	allNames: string[];
}

/**
 * Read AcroForm fields from uploaded PDF bytes (D1: server-side, WASM stays off
 * the client). Returns each detected field mapped to a {@link FieldElement} plus
 * the page heights used for the coordinate flip. On any failure (corrupt /
 * encrypted / XFA) it returns empty results so the editor still opens for
 * stamping — no fields are surfaced.
 *
 * A `command` (POST), not a `query` (GET): the PDF bytes travel in the request
 * body. As a query the devalue-encoded bytes would be packed into the URL,
 * blowing the HTTP header-size limit for anything but tiny files — the cause of
 * uploads silently failing to surface fields.
 */
export const extractFields = command(
	'unchecked',
	async (input: unknown): Promise<ExtractFieldsResult> => {
		const bytes = (input as { bytes?: unknown } | null)?.bytes;
		if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
			return { fields: [], pageHeights: [], allNames: [] };
		}
		try {
			const doc = await PdfDocument.load(bytes);
			const pageHeights = doc.getPages().map((p) => p.height);
			const infos = doc.getForm().getFields() as unknown as FieldInfoLike[];
			const fields = mapFields(infos, pageHeights);
			const allNames = infos.map((i) => i.name);
			return { fields, pageHeights, allNames };
		} catch (error) {
			console.error('Error extracting fields:', error);
			return { fields: [], pageHeights: [], allNames: [] };
		}
	}
);
