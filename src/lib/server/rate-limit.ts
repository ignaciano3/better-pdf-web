/**
 * Pure rate-limit decision logic. No I/O, no DB, no clock reads beyond what is
 * passed in — fully unit-testable. The caller is responsible for resolving
 * identity, choosing the window, and counting prior events; this module only
 * turns those numbers into an allow/deny decision.
 *
 * Caps (issue #6): anonymous 2/hour, authenticated 5/hour. Paid tiers and the
 * `subscription` table arrive in #12 and are intentionally not modeled here.
 */

export type IdentityKind = 'anon' | 'user';

/** Sliding window in milliseconds. */
export const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Per-window export caps, keyed by identity kind. */
export const CAPS: Record<IdentityKind, number> = {
	anon: 2,
	user: 5
};

export interface RateDecision {
	/** Whether this action is permitted. */
	allowed: boolean;
	/** The cap that applied. */
	limit: number;
	/** Remaining actions in the window AFTER this one (never negative). */
	remaining: number;
}

/**
 * Decide whether an action is allowed.
 *
 * @param kind     anon | user — selects the cap.
 * @param priorCount number of events already recorded in the current window.
 * @returns allow/deny with the applied limit and remaining budget.
 */
export function decide(kind: IdentityKind, priorCount: number): RateDecision {
	const limit = CAPS[kind];
	const allowed = priorCount < limit;
	// Budget remaining after this action would be recorded.
	const remaining = allowed ? Math.max(0, limit - priorCount - 1) : 0;
	return { allowed, limit, remaining };
}

/**
 * The inclusive lower bound of the current window, given "now". Events with
 * `createdAt >= windowStart(now)` count toward the cap.
 */
export function windowStart(now: Date): Date {
	return new Date(now.getTime() - WINDOW_MS);
}
