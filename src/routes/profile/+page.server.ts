import { redirect } from '@sveltejs/kit';
import { eq, isNotNull, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import { account } from '$lib/server/db/schema';
import { resolvePlan } from '$lib/server/plan';
import { countInWindow } from '$lib/server/usage-count';
import { usageView } from '$lib/server/profile-usage';
import { windowStart, WINDOW_MS } from '$lib/server/rate-limit';
import { usageEvent } from '$lib/server/db/schema.app';
import { windowWhere } from '$lib/server/usage-count';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	const userId = locals.user.id;
	const db = getDb();

	const plan = await resolvePlan(userId);

	// Subscription details (absent for free/root).
	const subRows = await db
		.select({
			status: subscription.status,
			currentPeriodEnd: subscription.currentPeriodEnd,
			manageUrl: subscription.manageUrl
		})
		.from(subscription)
		.where(eq(subscription.userId, userId))
		.limit(1);
	const sub = subRows[0];

	// hasPassword: a credential account row with a non-null password exists.
	const pwRows = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), isNotNull(account.password)))
		.limit(1);
	const hasPassword = pwRows.length > 0;

	// Usage in the current window.
	const now = new Date();
	const used = await countInWindow(userId, undefined, now);
	const view = usageView(plan, used);

	// resetAt: when the oldest in-window event ages out (only meaningful when capped).
	let resetAt: string | null = null;
	if (view.limit !== null && used >= view.limit) {
		const oldest = await db
			.select({ createdAt: usageEvent.createdAt })
			.from(usageEvent)
			.where(windowWhere(userId, undefined, windowStart(now)))
			.orderBy(usageEvent.createdAt)
			.limit(1);
		const t = oldest[0]?.createdAt;
		resetAt = t ? new Date(t.getTime() + WINDOW_MS).toISOString() : null;
	}

	return {
		email: locals.user.email,
		name: locals.user.name ?? '',
		emailVerified: locals.user.emailVerified ?? false,
		plan,
		hasPassword,
		subscription: {
			status: sub?.status ?? null,
			currentPeriodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
			manageUrl: sub?.manageUrl ?? null
		},
		usage: { used: view.used, limit: view.limit, resetAt }
	};
};
