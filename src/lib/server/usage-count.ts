import { and, count, eq, gte, isNull, or, type SQL } from 'drizzle-orm';
import { getDb } from './db';
import { usageEvent } from './db/schema.app';
import { windowStart } from './rate-limit';

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
	const anonMatch = ipHash ? and(isNull(usageEvent.userId), eq(usageEvent.ipHash, ipHash)) : undefined;
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
