import { and, count, eq, gte, isNull, or, type SQL } from 'drizzle-orm';
import { getDb } from './db';
import { usageEvent } from './db/schema.app';
import { windowStart, WINDOW_MS } from './rate-limit';
import { usageView } from './profile-usage';
import type { Plan } from './plan';

/** The single rate-limited action recorded in `usage_event`. */
export const EXPORT_ACTION = 'export';

/**
 * SQL predicate matching an actor's in-window export events: their own
 * authenticated events, plus anonymous events by ipHash (when an ipHash is
 * given). Mirrors `countsTowardWindow` in `usage-window.ts`.
 *
 * - userId + ipHash: own events OR anonymous events by ipHash.
 * - ipHash only (no userId): anonymous events by ipHash.
 * - userId only (no ipHash): own events only — no anonymous branch, so no
 *   `undefined` bind value is ever sent to the driver.
 */
export function windowWhere(
	userId: string | undefined,
	ipHash: string | undefined,
	since: Date
): SQL | undefined {
	const anonMatch = ipHash
		? and(isNull(usageEvent.userId), eq(usageEvent.ipHash, ipHash))
		: undefined;
	const who = userId
		? anonMatch
			? or(eq(usageEvent.userId, userId), anonMatch)
			: eq(usageEvent.userId, userId)
		: anonMatch;
	return and(eq(usageEvent.action, EXPORT_ACTION), who, gte(usageEvent.createdAt, since));
}

/** Count an actor's prior export events in the current window. */
export async function countInWindow(
	userId: string | undefined,
	ipHash: string | undefined,
	now: Date
): Promise<number> {
	const db = getDb();
	const rows = await db
		.select({ value: count() })
		.from(usageEvent)
		.where(windowWhere(userId, ipHash, windowStart(now)));
	return rows[0]?.value ?? 0;
}

/**
 * Resolve an actor's in-window usage view for display: their count (own events,
 * plus anonymous events by ipHash when one is given), the plan's limit, and —
 * only when capped out — when the oldest in-window event ages out (resetAt).
 * Serialized (resetAt as an ISO string or null) so it crosses load/query
 * boundaries cleanly. Single source of truth for the profile load and the
 * `getProfileUsage` remote query.
 */
export async function usageForActor(
	userId: string | undefined,
	ipHash: string | undefined,
	plan: Plan,
	now: Date
): Promise<{ used: number; limit: number | null; resetAt: string | null }> {
	const used = await countInWindow(userId, ipHash, now);
	const view = usageView(plan, used);

	let resetAt: string | null = null;
	if (view.limit !== null && view.used >= view.limit) {
		// Approximation: a slot frees up when the OLDEST in-window event ages out.
		// The gate's `nextExportAllowedAt` computes the exact reset (the
		// `priorCount - limit + 1`-th oldest) for enforcement; here it only drives
		// a "Resets around …" hint, so the oldest-event estimate is good enough and
		// can read slightly early when the actor is over the cap by more than one.
		const db = getDb();
		const oldest = await db
			.select({ createdAt: usageEvent.createdAt })
			.from(usageEvent)
			.where(windowWhere(userId, ipHash, windowStart(now)))
			.orderBy(usageEvent.createdAt)
			.limit(1);
		const t = oldest[0]?.createdAt;
		resetAt = t ? new Date(t.getTime() + WINDOW_MS).toISOString() : null;
	}
	return { used: view.used, limit: view.limit, resetAt };
}
