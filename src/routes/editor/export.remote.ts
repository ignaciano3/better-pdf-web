import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, count, eq, gte } from 'drizzle-orm';
import { buildPdf, PdfBuildError } from '$lib/pdf/build';
import { getDb } from '$lib/server/db';
import { usageEvent } from '$lib/server/db/schema.app';
import { resolveIdentity } from '$lib/server/identity';
import { resolvePlan } from '$lib/server/plan';
import { decide, windowStart, WINDOW_MS, type Tier } from '$lib/server/rate-limit';
import { logExportError } from './export-error-log';
import { validateExportInput } from './export-validate';

const EXPORT_ACTION = 'export';
const UPGRADE_URL = '/pricing';

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
	const { state, fingerprint } = validateExportInput(input);

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
			// Expected bad input, not a bug — `logExportError` skips it too.
			error(422, e.message);
		}
		// Unexpected failure (becomes a 500). Record it for diagnosis before
		// re-throwing; best-effort, so a logging failure never masks the error.
		await logExportError(e, tier, identity);
		throw e;
	}
});
