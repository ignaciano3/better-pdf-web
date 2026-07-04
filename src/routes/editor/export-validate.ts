import { error } from '@sveltejs/kit';
import {
	STANDARD_FONTS,
	type DocumentMetadataInput,
	type EditElement,
	type EditState,
	type OutlineItem,
	type PageOp
} from '$lib/pdf/types';

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
// Vector point caps so a runaway path/polygon can't blow up the renderer.
const MAX_POINTS = 10_000;
const MAX_URL_LEN = 2_048;
// Embedded custom-font caps.
const MAX_FONTS = 50;
const MAX_FONT_BYTES = 5 * 1024 * 1024; // 5 MB per font
// Multi-source merge caps.
const MAX_SOURCES = 5;
const MAX_TOTAL_SOURCE_BYTES = 60 * 1024 * 1024; // 60 MB across all sources
// Document-properties caps.
const MAX_METADATA_STR_LEN = 10_000;
const MAX_KEYWORDS = 1_000;
// Outline caps.
const MAX_OUTLINE_ITEMS = 5_000;
const MAX_OUTLINE_DEPTH = 32;
const MAX_OUTLINE_TITLE_LEN = 2_000;

const FIELD_KINDS = ['text', 'checkbox', 'radio', 'dropdown', 'signature', 'listbox', 'combo'];

function isFiniteNumber(n: unknown): n is number {
	return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Validate a vector point list: an array (length within `[min, MAX_POINTS]`) of
 * `{x, y}` finite numbers. Throws a 422 on any violation.
 */
function validatePoints(points: unknown, min: number): void {
	if (!Array.isArray(points)) error(422, 'Invalid points');
	if (points.length < min) error(422, 'Too few points');
	if (points.length > MAX_POINTS) error(422, 'Too many points');
	for (const p of points as unknown[]) {
		if (!p || typeof p !== 'object') error(422, 'Invalid point');
		const pt = p as { x?: unknown; y?: unknown };
		if (!isFiniteNumber(pt.x) || !isFiniteNumber(pt.y)) error(422, 'Invalid point coordinate');
	}
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
			if (el.fontId !== undefined && typeof el.fontId !== 'string')
				error(422, 'Invalid text fontId');
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
		case 'path':
			validatePoints(el.points, 1);
			if (el.strokeWidth !== undefined && !isFiniteNumber(el.strokeWidth)) {
				error(422, 'Invalid path stroke width');
			}
			if (el.opacity !== undefined && !isFiniteNumber(el.opacity)) {
				error(422, 'Invalid path opacity');
			}
			break;
		case 'polygon':
			validatePoints(el.points, 2);
			if (el.strokeWidth !== undefined && !isFiniteNumber(el.strokeWidth)) {
				error(422, 'Invalid polygon stroke width');
			}
			if (el.opacity !== undefined && !isFiniteNumber(el.opacity)) {
				error(422, 'Invalid polygon opacity');
			}
			break;
		case 'link': {
			if (!isFiniteNumber(el.width) || !isFiniteNumber(el.height)) {
				error(422, 'Invalid link geometry');
			}
			const hasUrl = el.url !== undefined;
			const hasGoTo = el.goToPage !== undefined;
			// Exactly one target — reject both-or-neither.
			if (hasUrl === hasGoTo) error(422, 'Link must have exactly one of url or goToPage');
			if (hasUrl) {
				if (typeof el.url !== 'string' || el.url.length === 0) error(422, 'Invalid link url');
				if (el.url.length > MAX_URL_LEN) error(422, 'Link url too large');
			} else {
				if (!isFiniteNumber(el.goToPage) || !Number.isInteger(el.goToPage) || el.goToPage < 0) {
					error(422, 'Invalid link goToPage');
				}
			}
			break;
		}
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
			if (el.multiSelect !== undefined && typeof el.multiSelect !== 'boolean') {
				error(422, 'Invalid field multiSelect');
			}
			if (el.selectedValues !== undefined) {
				if (
					!Array.isArray(el.selectedValues) ||
					!el.selectedValues.every((v) => typeof v === 'string')
				) {
					error(422, 'Invalid field selectedValues');
				}
				if (el.selectedValues.length > MAX_FIELD_OPTIONS) {
					error(422, 'Too many field selectedValues');
				}
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

/** Validate document metadata: capped strings + a bounded keywords array. */
function validateMetadata(meta: unknown): void {
	if (!meta || typeof meta !== 'object') error(422, 'Invalid metadata');
	const m = meta as DocumentMetadataInput;
	for (const key of ['title', 'author', 'subject', 'creator', 'producer'] as const) {
		const v = m[key];
		if (v !== undefined) {
			if (typeof v !== 'string') error(422, `Invalid metadata ${key}`);
			if (v.length > MAX_METADATA_STR_LEN) error(422, `Metadata ${key} too large`);
		}
	}
	if (m.keywords !== undefined) {
		if (!Array.isArray(m.keywords)) error(422, 'Invalid metadata keywords');
		if (m.keywords.length > MAX_KEYWORDS) error(422, 'Too many keywords');
		for (const k of m.keywords) {
			if (typeof k !== 'string') error(422, 'Invalid metadata keyword');
			if (k.length > MAX_METADATA_STR_LEN) error(422, 'Metadata keyword too large');
		}
	}
}

/** Validate the optional watermark: text or image kind, capped + bounded. */
function validateWatermark(wm: unknown): void {
	if (!wm || typeof wm !== 'object') error(422, 'Invalid watermark');
	const w = wm as {
		text?: unknown;
		font?: unknown;
		size?: unknown;
		color?: unknown;
		opacity?: unknown;
		rotation?: unknown;
		image?: unknown;
		format?: unknown;
		imageWidth?: unknown;
		imageHeight?: unknown;
	};
	if (typeof w.text !== 'string') error(422, 'Invalid watermark text');
	if ((w.text as string).length > MAX_TEXT_LEN) error(422, 'Watermark text too large');
	if (w.image !== undefined) {
		if (!(w.image instanceof Uint8Array)) error(422, 'Invalid watermark image');
		if ((w.image as Uint8Array).byteLength > MAX_IMAGE_BYTES) {
			error(413, 'Watermark image too large');
		}
		if (w.format !== 'png' && w.format !== 'jpg') error(422, 'Invalid watermark image format');
		if (w.imageWidth !== undefined && !isFiniteNumber(w.imageWidth)) {
			error(422, 'Invalid watermark image width');
		}
		if (w.imageHeight !== undefined && !isFiniteNumber(w.imageHeight)) {
			error(422, 'Invalid watermark image height');
		}
	}
	if (w.font !== undefined && !(STANDARD_FONTS as readonly string[]).includes(w.font as string)) {
		error(422, 'Invalid watermark font');
	}
	if (w.size !== undefined && !isFiniteNumber(w.size)) error(422, 'Invalid watermark size');
	if (w.rotation !== undefined && !isFiniteNumber(w.rotation)) {
		error(422, 'Invalid watermark rotation');
	}
	if (w.opacity !== undefined) {
		if (!isFiniteNumber(w.opacity) || w.opacity < 0 || w.opacity > 1) {
			error(422, 'Invalid watermark opacity');
		}
	}
	if (w.color !== undefined) {
		const c = w.color as { r?: unknown; g?: unknown; b?: unknown };
		if (
			!c ||
			typeof c !== 'object' ||
			!isFiniteNumber(c.r) ||
			!isFiniteNumber(c.g) ||
			!isFiniteNumber(c.b)
		) {
			error(422, 'Invalid watermark color');
		}
	}
}

/**
 * Validate an outline tree: bounded total item count + depth, string titles, and
 * page indices that are finite non-negative integers (and, when the output page
 * count is known, within range).
 */
function validateOutline(outline: unknown, pageCount: number | undefined): void {
	if (!Array.isArray(outline)) error(422, 'Invalid outline');
	let total = 0;
	const walk = (items: unknown[], depth: number): void => {
		if (depth > MAX_OUTLINE_DEPTH) error(422, 'Outline too deep');
		for (const raw of items) {
			if (++total > MAX_OUTLINE_ITEMS) error(422, 'Too many outline items');
			if (!raw || typeof raw !== 'object') error(422, 'Invalid outline item');
			const item = raw as Partial<OutlineItem>;
			if (typeof item.title !== 'string') error(422, 'Invalid outline title');
			if (item.title.length > MAX_OUTLINE_TITLE_LEN) error(422, 'Outline title too large');
			if (!Number.isInteger(item.page) || (item.page as number) < 0) {
				error(422, 'Invalid outline page');
			}
			if (pageCount !== undefined && (item.page as number) >= pageCount) {
				error(422, 'Outline page out of range');
			}
			if (item.children !== undefined) {
				if (!Array.isArray(item.children)) error(422, 'Invalid outline children');
				walk(item.children, depth + 1);
			}
		}
	};
	walk(outline, 1);
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

	// Multi-source merge: an array of source documents (sources[0] is primary).
	if (state.sources !== undefined) {
		if (!Array.isArray(state.sources)) error(422, 'Invalid sources');
		if (state.sources.length > MAX_SOURCES) error(422, 'Too many source documents');
		let total = 0;
		for (const s of state.sources) {
			if (!(s instanceof Uint8Array)) error(422, 'Invalid source document');
			if (s.byteLength > MAX_SOURCE_PDF_BYTES) error(413, 'Source PDF too large');
			total += s.byteLength;
		}
		if (total > MAX_TOTAL_SOURCE_BYTES) error(413, 'Source documents too large');
	}

	// How many source documents are addressable by a source PageOp's docIndex.
	const sourceCount =
		state.sources !== undefined ? state.sources.length : state.sourcePdf !== undefined ? 1 : 0;

	if (state.pageOps !== undefined) {
		if (!Array.isArray(state.pageOps)) error(422, 'Invalid page operations');
		if (state.pageOps.length > MAX_PAGE_OPS) error(422, 'Too many page operations');
		for (const op of state.pageOps as PageOp[]) {
			if (!op || typeof op !== 'object') error(422, 'Invalid page operation');
			if (op.kind === 'source') {
				if (op.docIndex !== undefined) {
					if (!Number.isInteger(op.docIndex) || op.docIndex < 0 || op.docIndex >= sourceCount) {
						error(422, 'Invalid page operation docIndex');
					}
				}
				if (op.size !== undefined) {
					if (
						!Array.isArray(op.size) ||
						op.size.length !== 2 ||
						!op.size.every((n) => isFiniteNumber(n) && n > 0)
					) {
						error(422, 'Invalid page operation size');
					}
				}
			}
		}
	}

	// Output page count for outline range checks. Known exactly only when pageOps
	// describe the output layout; otherwise indices are only checked >= 0.
	const outputPageCount =
		state.pageOps !== undefined && Array.isArray(state.pageOps) ? state.pageOps.length : undefined;

	if (state.metadata !== undefined) validateMetadata(state.metadata);
	if (state.outline !== undefined) validateOutline(state.outline, outputPageCount);

	if (state.fonts !== undefined) {
		if (!Array.isArray(state.fonts)) error(422, 'Invalid fonts');
		if (state.fonts.length > MAX_FONTS) error(422, 'Too many fonts');
		for (const font of state.fonts) {
			if (!font || typeof font !== 'object') error(422, 'Invalid font asset');
			if (typeof font.id !== 'string' || font.id.length === 0) error(422, 'Invalid font id');
			if (typeof font.name !== 'string') error(422, 'Invalid font name');
			if (!(font.bytes instanceof Uint8Array)) error(422, 'Invalid font bytes');
			if (font.bytes.byteLength > MAX_FONT_BYTES) error(413, 'Font too large');
		}
	}

	if (state.flatten !== undefined && typeof state.flatten !== 'boolean') {
		error(422, 'Invalid flatten flag');
	}

	if (state.objectStreams !== undefined && typeof state.objectStreams !== 'boolean') {
		error(422, 'Invalid objectStreams flag');
	}

	if (state.watermark !== undefined) validateWatermark(state.watermark);

	return { state: state as EditState, fingerprint };
}
