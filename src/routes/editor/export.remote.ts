import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, count, eq, gte } from 'drizzle-orm';
import { buildPdf, PdfBuildError } from '$lib/pdf/build';
import type { EditState, TextElement } from '$lib/pdf/types';
import { getDb } from '$lib/server/db';
import { usageEvent } from '$lib/server/db/schema.app';
import { resolveIdentity } from '$lib/server/identity';
import { decide, windowStart, WINDOW_MS } from '$lib/server/rate-limit';

// Server-side hard limits. These cap the attack surface of the WASM/PDF
// parsers for this endpoint. Identity + rate limiting + schema validation
// land in #6 (S5); these guards are the minimum that should never wait.
const MAX_SOURCE_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ELEMENTS = 5_000;
const MAX_TEXT_LEN = 20_000;
const MAX_FINGERPRINT_LEN = 256;
const EXPORT_ACTION = 'export';
const UPGRADE_URL = '/pricing';

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
 * (#4). Gated by per-identity rate limiting (#6): anonymous 2/hour,
 * authenticated 5/hour. Over the cap returns HTTP 429.
 */
export const exportPdf = command('unchecked', async (input: unknown): Promise<Uint8Array> => {
	const { state, fingerprint } = validate(input);

	const event = getRequestEvent();
	const identity = resolveIdentity(event, fingerprint);

	const now = new Date();
	const priorCount = await countInWindow(identity.userId, identity.ipHash, now);
	const verdict = decide(identity.kind, priorCount);
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
			tierAtTime: identity.tier,
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
