import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import { buildPdf, PdfBuildError } from '$lib/pdf/build';
import type { EditState, TextElement } from '$lib/pdf/types';

// Server-side hard limits. These cap the attack surface of the WASM/PDF
// parsers for this still-unauthenticated endpoint. Full identity + rate
// limiting + schema validation arrive in #6 (S5); these guards are the
// minimum that should never wait for it.
const MAX_SOURCE_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ELEMENTS = 5_000;
const MAX_TEXT_LEN = 20_000;

/**
 * Reject malformed or oversized payloads before they reach the PDF parsers.
 * Throws a SvelteKit `error()` (413/422) on violation; returns a validated
 * `EditState` otherwise.
 */
function validate(input: unknown): EditState {
	if (typeof input !== 'object' || input === null) error(422, 'Invalid request body');
	const state = input as Partial<EditState>;

	const size = state.pageSize;
	if (
		!Array.isArray(size) ||
		size.length !== 2 ||
		!size.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
	) {
		error(422, 'Invalid page size');
	}

	if (!Array.isArray(state.elements)) error(422, 'Invalid elements');
	if (state.elements.length > MAX_ELEMENTS) error(422, 'Too many elements');
	for (const el of state.elements as TextElement[]) {
		if (el?.type !== 'text' || typeof el.text !== 'string') error(422, 'Invalid element');
		if (el.text.length > MAX_TEXT_LEN) error(422, 'Text element too large');
		for (const n of [el.x, el.y, el.size]) {
			if (typeof n !== 'number' || !Number.isFinite(n)) error(422, 'Invalid element geometry');
		}
	}

	if (state.sourcePdf !== undefined) {
		if (!(state.sourcePdf instanceof Uint8Array)) error(422, 'Invalid source PDF');
		if (state.sourcePdf.byteLength > MAX_SOURCE_PDF_BYTES) error(413, 'Source PDF too large');
	}

	return state as EditState;
}

/**
 * Finalize the editor document into PDF bytes on the server.
 *
 * Supports blank-canvas authoring and stamping onto an uploaded source PDF
 * (#4). This is the gated export seam; identity + rate limiting land in #6.
 */
export const exportPdf = command('unchecked', async (input: unknown): Promise<Uint8Array> => {
	const state = validate(input);
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
