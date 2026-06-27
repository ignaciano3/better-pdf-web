import { eq } from 'drizzle-orm';
import { resolvePlan } from '$lib/server/plan';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Anonymous callers never hit the DB.
	if (!locals.user) {
		return { user: null, plan: 'free' as const, isRoot: false, manageUrl: null };
	}

	const plan = await resolvePlan(locals.user.id);

	// Only fetch the portal URL for paying users (root has no LS subscription).
	let manageUrl: string | null = null;
	if (plan === 'pro') {
		const rows = await getDb()
			.select({ manageUrl: subscription.manageUrl })
			.from(subscription)
			.where(eq(subscription.userId, locals.user.id))
			.limit(1);
		manageUrl = rows[0]?.manageUrl ?? null;
	}

	return { user: locals.user, plan, isRoot: plan === 'root', manageUrl };
};
