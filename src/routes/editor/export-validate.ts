import { error } from '@sveltejs/kit';
import type { EditElement, EditState } from '$lib/pdf/types';

// Server-side hard limits. These cap the attack surface of the WASM/PDF
// parsers for the export endpoint. Kept in a non-remote module so they can be
// unit-tested directly (a `.remote.ts` file may only export remote functions).
const MAX_SOURCE_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ELEMENTS = 5_000;
const MAX_TEXT_LEN = 20_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB per embedded raster element
const MAX_PAGE_OPS = 10_000;
const MAX_FINGERPRINT_LEN = 256;
const MAX_FIELD_NAME_LEN = 256;
const MAX_FIELD_OPTIONS = 1_000;
// Signature dataURLs are stored in `value`; cap generously (~2 MB of base64).
const MAX_FIELD_VALUE_LEN = 2_000_000;

const FIELD_KINDS = ['text', 'checkbox', 'radio', 'dropdown', 'signature', 'listbox', 'combo'];

function isFiniteNumber(n: unknown): n is number {
	return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Validate one editor element by type before it reaches the PDF renderers.
 * Every element type the editor can produce (text, signature, image, shape)
 * must be accepted here — otherwise valid exports 422.
 */
function validateElement(el: EditElement): void {
	if (!el || typeof el !== 'object') error(422, 'Invalid element');
	if (!isFiniteNumber(el.x) || !isFiniteNumber(el.y)) error(422, 'Invalid element geometry');
	if (el.page !== undefined && !isFiniteNumber(el.page)) error(422, 'Invalid element page');

	switch (el.type) {
		case 'text':
			if (typeof el.text !== 'string') error(422, 'Invalid text element');
			if (el.text.length > MAX_TEXT_LEN) error(422, 'Text element too large');
			if (!isFiniteNumber(el.size)) error(422, 'Invalid text size');
			if (el.opacity !== undefined && !isFiniteNumber(el.opacity)) error(422, 'Invalid opacity');
			if (el.rotation !== undefined && !isFiniteNumber(el.rotation)) error(422, 'Invalid rotation');
			if (el.lineHeight !== undefined && !isFiniteNumber(el.lineHeight)) {
				error(422, 'Invalid line height');
			}
			if (el.maxWidth !== undefined && !isFiniteNumber(el.maxWidth))
				error(422, 'Invalid max width');
			break;
		case 'signature':
		case 'image':
			if (!isFiniteNumber(el.width) || !isFiniteNumber(el.height)) {
				error(422, 'Invalid image geometry');
			}
			if (!(el.image instanceof Uint8Array)) error(422, 'Invalid image data');
			if (el.image.byteLength > MAX_IMAGE_BYTES) error(413, 'Embedded image too large');
			if (el.format !== 'png' && el.format !== 'jpg') error(422, 'Invalid image format');
			break;
		case 'shape':
			if (!isFiniteNumber(el.width) || !isFiniteNumber(el.height)) {
				error(422, 'Invalid shape geometry');
			}
			if (!['line', 'rectangle', 'ellipse'].includes(el.shape)) error(422, 'Invalid shape kind');
			break;
		case 'field':
			if (!isFiniteNumber(el.width) || !isFiniteNumber(el.height)) {
				error(422, 'Invalid field geometry');
			}
			if (!FIELD_KINDS.includes(el.field)) error(422, 'Invalid field kind');
			if (typeof el.name !== 'string' || el.name.length === 0) error(422, 'Invalid field name');
			if (el.name.length > MAX_FIELD_NAME_LEN) error(422, 'Field name too large');
			if (el.options !== undefined) {
				if (!Array.isArray(el.options) || !el.options.every((o) => typeof o === 'string')) {
					error(422, 'Invalid field options');
				}
				if (el.options.length > MAX_FIELD_OPTIONS) error(422, 'Too many field options');
			}
			if (el.maxLength !== undefined && !isFiniteNumber(el.maxLength)) {
				error(422, 'Invalid field max length');
			}
			if (el.border?.width !== undefined && !isFiniteNumber(el.border.width)) {
				error(422, 'Invalid field border width');
			}
			if (el.value !== undefined) {
				if (typeof el.value !== 'string') error(422, 'Invalid field value');
				if (el.value.length > MAX_FIELD_VALUE_LEN) error(422, 'Field value too large');
			}
			break;
		default:
			error(422, 'Unknown element type');
	}
}

/** Wire shape of the export command input: edit state plus client fingerprint. */
export interface ExportInput {
	state: EditState;
	fingerprint: string;
}

/**
 * Reject malformed or oversized payloads before they reach the PDF parsers.
 * Throws a SvelteKit `error()` (413/422) on violation; returns the validated
 * `EditState` and fingerprint otherwise.
 */
export function validateExportInput(input: unknown): ExportInput {
	if (typeof input !== 'object' || input === null) error(422, 'Invalid request body');
	const body = input as Partial<ExportInput>;

	const fingerprint = body.fingerprint;
	if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
		error(422, 'Invalid fingerprint');
	}
	if (fingerprint.length > MAX_FINGERPRINT_LEN) error(422, 'Fingerprint too large');

	if (typeof body.state !== 'object' || body.state === null) error(422, 'Invalid request body');
	const state = body.state as Partial<EditState>;

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
	for (const el of state.elements as EditElement[]) {
		validateElement(el);
	}

	if (state.sourcePdf !== undefined) {
		if (!(state.sourcePdf instanceof Uint8Array)) error(422, 'Invalid source PDF');
		if (state.sourcePdf.byteLength > MAX_SOURCE_PDF_BYTES) error(413, 'Source PDF too large');
	}

	if (state.pageOps !== undefined) {
		if (!Array.isArray(state.pageOps)) error(422, 'Invalid page operations');
		if (state.pageOps.length > MAX_PAGE_OPS) error(422, 'Too many page operations');
	}

	return { state: state as EditState, fingerprint };
}
