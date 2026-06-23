import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { subscription } from './db/schema.app';

/** Billing plan for a user. Absence of a subscription row means 'free'. */
export type Plan = 'free' | 'pro';

/**
 * Resolve a user's plan from the `subscription` table.
 *
 * This is the #12 stub: there is no billing integration, so the only source of
 * truth is the `subscription` table, which the app never writes. The default is
 * 'free' whenever there is no user, no row, or anything other than a fully
 * valid pro entitlement.
 *
 * Pro is granted ONLY when the row is `plan='pro'` AND `status='active'` AND not
 * past its `current_period_end`. Checking `plan` alone would fail open: once
 * billing writes rows, a canceled or expired pro subscription would keep
 * granting pro access. Anonymous callers never reach the database.
 */
export async function resolvePlan(userId: string | undefined): Promise<Plan> {
	if (!userId) return 'free';

	const rows = await getDb()
		.select({
			plan: subscription.plan,
			status: subscription.status,
			currentPeriodEnd: subscription.currentPeriodEnd
		})
		.from(subscription)
		.where(eq(subscription.userId, userId))
		.limit(1);

	const row = rows[0];
	if (!row || row.plan !== 'pro' || row.status !== 'active') return 'free';
	// An entitlement that has run out is no longer pro.
	if (row.currentPeriodEnd && row.currentPeriodEnd.getTime() < Date.now()) return 'free';
	return 'pro';
}

/**
 * Gate for pro-only ("heavy") operations such as future OCR/compression. Throws
 * an HTTP 402 (Payment Required) for any non-pro plan, giving downstream
 * features a single seam to guard behind. Returns normally for pro.
 */
export function assertPro(plan: Plan): void {
	if (plan !== 'pro') {
		error(402, JSON.stringify({ reason: 'pro_required', upgradeUrl: '/pricing' }));
	}
}
