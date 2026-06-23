import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import { buildPdf, PdfBuildError } from '$lib/pdf/build';
import type { EditState } from '$lib/pdf/types';

/**
 * Finalize the editor document into PDF bytes on the server.
 *
 * Supports both blank-canvas authoring and stamping onto an uploaded source
 * PDF (#4): when `state.sourcePdf` is present, `buildPdf` loads that document
 * and draws the elements on top of its pages.
 *
 * This is the gated export seam. For the tracer (#3) it just builds the PDF;
 * identity resolution and rate limiting are layered on in #6 (S5).
 *
 * Validation is `unchecked` for now — a schema validator is introduced
 * alongside the rate-limit work.
 */
export const exportPdf = command('unchecked', async (state: EditState): Promise<Uint8Array> => {
	try {
		return await buildPdf(state);
	} catch (e) {
		if (e instanceof PdfBuildError) {
			// 422: the input PDF was unusable (corrupt/encrypted/unsupported).
			error(422, e.message);
		}
		throw e;
	}
});
