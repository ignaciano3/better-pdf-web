/**
 * Pure rule for which `usage_event` rows count toward an actor's rate-limit
 * window. Kept I/O-free and unit-testable, like `rate-limit.ts`. This is the
 * SOURCE OF TRUTH for the matching rule; `countInWindow` in
 * `routes/editor/export.remote.ts` builds the equivalent SQL `where` clause and
 * must stay in sync with it.
 */

/** Minimal shape of a `usage_event` row needed to decide window membership. */
export interface UsageRow {
	userId: string | null;
	ipHash: string | null;
}

/** The actor a count is being computed for (from `resolveIdentity`). */
export interface WindowActor {
	userId?: string;
	ipHash?: string;
}

/**
 * Whether `row` counts toward `actor`'s current rate-limit window.
 *
 * A row counts when it is either:
 *  - the actor's own authenticated event (`row.userId === actor.userId`), or
 *  - an anonymous event from the actor's browser/IP (`row.userId == null &&
 *    row.ipHash === actor.ipHash`).
 *
 * The `row.userId == null` guard on the anonymous branch is what bridges a
 * guest's pre-signup exports into their new account WITHOUT letting a *different*
 * account on a shared computer inherit the budget: once an event is recorded
 * against a userId it can only count for that user.
 */
export function countsTowardWindow(row: UsageRow, actor: WindowActor): boolean {
	if (actor.userId != null && row.userId === actor.userId) return true;
	if (actor.ipHash != null && row.userId == null && row.ipHash === actor.ipHash) return true;
	return false;
}
