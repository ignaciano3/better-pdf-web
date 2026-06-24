import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, count, eq, gte } from 'drizzle-orm';
import { buildPdf, PdfBuildError } from '$lib/pdf/build';
import type { EditElement, EditState } from '$lib/pdf/types';
import { getDb } from '$lib/server/db';
import { usageEvent } from '$lib/server/db/schema.app';
import { resolveIdentity } from '$lib/server/identity';
import { resolvePlan } from '$lib/server/plan';
import { decide, windowStart, WINDOW_MS, type Tier } from '$lib/server/rate-limit';

// Server-side hard limits. These cap the attack surface of the WASM/PDF
// parsers for this endpoint. Identity + rate limiting + schema validation
// land in #6 (S5); these guards are the minimum that should never wait.
const MAX_SOURCE_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ELEMENTS = 5_000;
const MAX_TEXT_LEN = 20_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB per embedded raster element
const MAX_PAGE_OPS = 10_000;
const MAX_FINGERPRINT_LEN = 256;
const EXPORT_ACTION = 'export';
const UPGRADE_URL = '/pricing';

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
		default:
			error(422, 'Unknown element type');
	}
}

/** Wire shape of the export command input: edit state plus client fingerprint. */
interface ExportInput {
	state: EditState;
	fingerprint: string;
}

/**
 * Reject malformed or oversized payloads before they reach the PDF parsers.
 * Throws a SvelteKit `error()` (413/422) on violation; returns the validated
 * `EditState` and fingerprint otherwise.
 */
function validate(input: unknown): ExportInput {
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

/**
 * Count this actor's prior export events within the current window.
 */
async function countInWindow(
	userId: string | undefined,
	ipHash: string | undefined,
	now: Date
): Promise<number> {
	const db = getDb();
	const since = windowStart(now);
	const who = userId ? eq(usageEvent.userId, userId) : eq(usageEvent.ipHash, ipHash!);
	const rows = await db
		.select({ value: count() })
		.from(usageEvent)
		.where(and(eq(usageEvent.action, EXPORT_ACTION), who, gte(usageEvent.createdAt, since)));
	return rows[0]?.value ?? 0;
}

/**
 * Finalize the editor document into PDF bytes on the server.
 *
 * Supports blank-canvas authoring and stamping onto an uploaded source PDF
 * (#4). Gated by tier-driven rate limiting (#6, #12): anonymous 2/hour, free
 * 5/hour, pro unlimited. Over the cap returns HTTP 429.
 */
export const exportPdf = command('unchecked', async (input: unknown): Promise<Uint8Array> => {
	const { state, fingerprint } = validate(input);

	const event = getRequestEvent();
	const identity = resolveIdentity(event, fingerprint);

	// Map identity → tier. Anonymous callers are the lowest tier; logged-in
	// callers get their resolved plan ('free' by default, 'pro' if subscribed).
	const tier: Tier = identity.kind === 'anon' ? 'anonymous' : await resolvePlan(identity.userId);

	const now = new Date();
	const priorCount = await countInWindow(identity.userId, identity.ipHash, now);
	const verdict = decide(tier, priorCount);
	if (!verdict.allowed) {
		error(
			429,
			JSON.stringify({
				reason: 'rate_limited',
				limit: verdict.limit,
				window: WINDOW_MS,
				upgradeUrl: UPGRADE_URL
			})
		);
	}

	// Under the cap: record the attempt before building so concurrent calls
	// can't both squeak past, then proceed.
	await getDb()
		.insert(usageEvent)
		.values({
			id: crypto.randomUUID(),
			action: EXPORT_ACTION,
			tierAtTime: tier,
			createdAt: now,
			...(identity.userId ? { userId: identity.userId } : {}),
			...(identity.ipHash ? { ipHash: identity.ipHash } : {})
		});

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
