import { command } from '$app/server';
import { buildPdf } from '$lib/pdf/build';
import type { EditState } from '$lib/pdf/types';

/**
 * Finalize the editor document into PDF bytes on the server.
 *
 * This is the gated export seam. For the tracer (#3) it just builds the PDF;
 * identity resolution and rate limiting are layered on in #6 (S5).
 *
 * Validation is `unchecked` for now — a schema validator is introduced
 * alongside the rate-limit work.
 */
export const exportPdf = command('unchecked', async (state: EditState): Promise<Uint8Array> => {
	return buildPdf(state);
});
