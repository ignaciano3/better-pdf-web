import { PdfDocument } from '@ignaciano3/better-pdf';
import type { AttachmentInput } from '$lib/pdf/types';

/**
 * Read every file embedded in `bytes` (client-side WASM; bytes never leave the
 * browser). Returns editor attachment records, one per embedded file, each with
 * a fresh id from `makeId`. The caller swallows failures — the editor still
 * opens with no attachments surfaced.
 */
export async function extractAttachmentsFromBytes(
	bytes: Uint8Array,
	makeId: () => string
): Promise<AttachmentInput[]> {
	const doc = await PdfDocument.load(bytes);
	const found = await doc.getAttachments();
	return found.map((a) => ({
		id: makeId(),
		name: a.name,
		bytes: a.bytes,
		...(a.mimeType ? { mimeType: a.mimeType } : {}),
		...(a.description ? { description: a.description } : {}),
		...(a.afRelationship ? { afRelationship: a.afRelationship } : {})
	}));
}
