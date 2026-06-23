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
 * therefore 'free' whenever there is no user, no row, or a non-'pro' plan
 * value. Anonymous callers (no `userId`) are implicitly the lowest tier and
 * never reach the database.
 */
export async function resolvePlan(userId: string | undefined): Promise<Plan> {
	if (!userId) return 'free';

	const rows = await getDb()
		.select({ plan: subscription.plan })
		.from(subscription)
		.where(eq(subscription.userId, userId))
		.limit(1);

	return rows[0]?.plan === 'pro' ? 'pro' : 'free';
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
