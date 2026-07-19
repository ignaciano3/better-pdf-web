import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { usageEvent } from '$lib/server/db/schema.app';
import { resolveIdentity } from '$lib/server/identity';
import { resolvePlan } from '$lib/server/plan';
import { decide, windowStart, WINDOW_MS, type Tier } from '$lib/server/rate-limit';
import { windowWhere, countInWindow, EXPORT_ACTION } from '$lib/server/usage-count';
import { parseFingerprint } from '$lib/server/fingerprint';
import { recordExportError } from './export-error-log';

const UPGRADE_URL = '/pricing';

/**
 * Epoch ms at which the actor can export again, given they're currently capped.
 * The window slides, so a slot frees up once enough of the oldest in-window
 * events age out: with `priorCount` events and cap `limit`, `priorCount-limit+1`
 * must expire, so the reset is that many-th oldest event's time + WINDOW_MS.
 * Returns null for an unlimited tier or when nothing is on record.
 */
async function nextExportAllowedAt(
	userId: string | undefined,
	ipHash: string | undefined,
	now: Date,
	limit: number,
	priorCount: number
): Promise<number | null> {
	const need = priorCount - limit + 1;
	if (!Number.isFinite(limit) || need < 1) return null;
	const db = getDb();
	const rows = await db
		.select({ createdAt: usageEvent.createdAt })
		.from(usageEvent)
		.where(windowWhere(userId, ipHash, windowStart(now)))
		.orderBy(usageEvent.createdAt) // oldest first
		.limit(need);
	const pivot = rows[rows.length - 1]?.createdAt;
	return pivot ? pivot.getTime() + WINDOW_MS : null;
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
		const fingerprint = parseFingerprint(input);
		const event = getRequestEvent();
		const identity = resolveIdentity(event, fingerprint);
		const tier: Tier = identity.kind === 'anon' ? 'anonymous' : await resolvePlan(identity.userId);

		const now = new Date();
		const priorCount = await countInWindow(identity.userId, identity.ipHash, now);
		const verdict = decide(tier, priorCount);
		if (!verdict.allowed) {
			const retryAt = await nextExportAllowedAt(
				identity.userId,
				identity.ipHash,
				now,
				verdict.limit,
				priorCount
			);
			error(
				429,
				JSON.stringify({
					reason: 'rate_limited',
					limit: verdict.limit,
					window: WINDOW_MS,
					...(retryAt !== null ? { retryAt } : {}),
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
