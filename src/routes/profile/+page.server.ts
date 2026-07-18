import { redirect } from '@sveltejs/kit';
import { eq, isNotNull, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import { account } from '$lib/server/db/schema';
import { resolvePlan } from '$lib/server/plan';
import { usageForActor } from '$lib/server/usage-count';
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

	// Usage in the current window — own events only at SSR (no fingerprint
	// server-side); the client refines to the combined own+anonymous count via
	// the getProfileUsage remote query.
	const usage = await usageForActor(userId, undefined, plan, new Date());

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
		usage
	};
};
