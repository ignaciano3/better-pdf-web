import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, count, eq, gte, isNull, or } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { usageEvent } from '$lib/server/db/schema.app';
import { resolveIdentity } from '$lib/server/identity';
import { resolvePlan } from '$lib/server/plan';
import { decide, windowStart, WINDOW_MS, type Tier } from '$lib/server/rate-limit';
import { recordExportError } from './export-error-log';

const EXPORT_ACTION = 'export';
const UPGRADE_URL = '/pricing';

/** Count this actor's prior export events in the current window (SQL mirror of
 *  `countsTowardWindow`: own userId events plus anonymous events by ipHash). */
async function countInWindow(
	userId: string | undefined,
	ipHash: string | undefined,
	now: Date
): Promise<number> {
	const db = getDb();
	const since = windowStart(now);
	const anonMatch = and(isNull(usageEvent.userId), eq(usageEvent.ipHash, ipHash!));
	const who = userId ? or(eq(usageEvent.userId, userId), anonMatch) : anonMatch;
	const rows = await db
		.select({ value: count() })
		.from(usageEvent)
		.where(and(eq(usageEvent.action, EXPORT_ACTION), who, gte(usageEvent.createdAt, since)));
	return rows[0]?.value ?? 0;
}

/**
 * Metadata-only export gate. Receives ONLY the fingerprint — no document bytes.
 * Resolves identity → tier, checks the window, and (when allowed) records the
 * usage event before returning. The client then builds the PDF locally. Over
 * the cap returns HTTP 429 with the upsell payload.
 */
export const checkExportAllowance = command(
	'unchecked',
	async (input: unknown): Promise<{ ok: true }> => {
		const fingerprint = (input as { fingerprint?: unknown } | null)?.fingerprint;
		if (typeof fingerprint !== 'string' || fingerprint.length === 0 || fingerprint.length > 256) {
			error(422, 'Invalid fingerprint');
		}
		const event = getRequestEvent();
		const identity = resolveIdentity(event, fingerprint);
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

		// Record before returning so concurrent calls can't both squeak past.
		await getDb()
			.insert(usageEvent)
			.values({
				id: crypto.randomUUID(),
				action: EXPORT_ACTION,
				tierAtTime: tier,
				createdAt: now,
				...(identity.userId ? { userId: identity.userId } : { ipHash: identity.ipHash })
			});
		return { ok: true };
	}
);

/**
 * Record an unexpected client build failure. Metadata only — the client sends
 * error name/message/stack and coarse doc-shape counts, never document content.
 */
export const reportExportError = command('unchecked', async (input: unknown): Promise<void> => {
	const b = (input ?? {}) as {
		fingerprint?: unknown;
		name?: unknown;
		message?: unknown;
		stack?: unknown;
		pageCount?: unknown;
		fieldCount?: unknown;
		stamping?: unknown;
	};
	const fingerprint = typeof b.fingerprint === 'string' ? b.fingerprint : '';
	const event = getRequestEvent();
	const identity = resolveIdentity(event, fingerprint);
	const tier: Tier = identity.kind === 'anon' ? 'anonymous' : await resolvePlan(identity.userId);
	await recordExportError(
		{
			name: typeof b.name === 'string' ? b.name.slice(0, 256) : 'Error',
			message: typeof b.message === 'string' ? b.message.slice(0, 4096) : String(b.message),
			...(typeof b.stack === 'string' ? { stack: b.stack.slice(0, 8192) } : {}),
			pageCount: typeof b.pageCount === 'number' ? b.pageCount : 0,
			fieldCount: typeof b.fieldCount === 'number' ? b.fieldCount : 0,
			stamping: b.stamping === true
		},
		tier,
		{
			...(identity.userId ? { userId: identity.userId } : {}),
			...(identity.ipHash ? { ipHash: identity.ipHash } : {})
		}
	);
});
