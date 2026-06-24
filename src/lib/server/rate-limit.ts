/**
 * Pure rate-limit decision logic. No I/O, no DB, no clock reads beyond what is
 * passed in — fully unit-testable. The caller is responsible for resolving
 * identity, choosing the tier, choosing the window, and counting prior events;
 * this module only turns those numbers into an allow/deny decision.
 *
 * Caps are keyed by tier (issue #12): anonymous 2/hour, free 5/hour, pro
 * unlimited. The caller maps an identity + resolved plan onto a tier.
 */

export type IdentityKind = 'anon' | 'user';

/**
 * Billing/usage tier that selects the cap. `root` is a private, highest-privilege
 * tier (the operator and invited friends) — unlimited, like `pro`, granted only
 * by a `subscription` row with `plan='root'`.
 */
export type Tier = 'anonymous' | 'free' | 'pro' | 'root';

/** Sliding window in milliseconds. */
export const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sentinel for "no cap". Pro is effectively unlimited; we model it as Infinity
 * so `priorCount < limit` is always true and `remaining` is always Infinity.
 */
export const UNLIMITED = Infinity;

/** Per-window export caps, keyed by tier. */
export const CAPS: Record<Tier, number> = {
	anonymous: 2,
	free: 5,
	pro: UNLIMITED,
	root: UNLIMITED
};

export interface RateDecision {
	/** Whether this action is permitted. */
	allowed: boolean;
	/** The cap that applied. `Infinity` for an unlimited (pro) tier. */
	limit: number;
	/** Remaining actions in the window AFTER this one (never negative). */
	remaining: number;
}

/**
 * Decide whether an action is allowed.
 *
 * @param tier       anonymous | free | pro — selects the cap.
 * @param priorCount number of events already recorded in the current window.
 * @returns allow/deny with the applied limit and remaining budget. For an
 *          unlimited tier, `allowed` is always true and `remaining` is
 *          `Infinity`.
 */
export function decide(tier: Tier, priorCount: number): RateDecision {
	const limit = CAPS[tier];
	const allowed = priorCount < limit;
	// Budget remaining after this action would be recorded. Infinity stays
	// Infinity; Math.max keeps finite tiers non-negative.
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
