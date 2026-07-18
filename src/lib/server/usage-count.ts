import { and, count, eq, gte, isNull, or, type SQL } from 'drizzle-orm';
import { getDb } from './db';
import { usageEvent } from './db/schema.app';
import { windowStart } from './rate-limit';

/** The single rate-limited action recorded in `usage_event`. */
export const EXPORT_ACTION = 'export';

/**
 * SQL predicate matching an actor's in-window export events: their own
 * authenticated events, plus anonymous events by ipHash. Mirrors
 * `countsTowardWindow` in `usage-window.ts`.
 */
export function windowWhere(
	userId: string | undefined,
	ipHash: string | undefined,
	since: Date
): SQL | undefined {
	const anonMatch = and(isNull(usageEvent.userId), eq(usageEvent.ipHash, ipHash!));
	const who = userId ? or(eq(usageEvent.userId, userId), anonMatch) : anonMatch;
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
