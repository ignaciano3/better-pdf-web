import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { subscription } from '$lib/server/db/schema.app';
import { resolvePlan } from '$lib/server/plan';
import type { PageServerLoad } from './$types';

/**
 * Admin dashboard — visible to `root` users only. Non-root (including anonymous)
 * callers get a 404 so the page's existence is not revealed.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const current = locals.user;
	if (!current) error(404, 'Not found');
	if ((await resolvePlan(current.id)) !== 'root') error(404, 'Not found');

	const rows = await getDb()
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			createdAt: user.createdAt,
			plan: subscription.plan,
			status: subscription.status
		})
		.from(user)
		.leftJoin(subscription, eq(subscription.userId, user.id))
		.orderBy(desc(user.createdAt));

	const users = rows.map((r) => ({
		id: r.id,
		name: r.name,
		email: r.email,
		emailVerified: r.emailVerified,
		createdAt: r.createdAt,
		// Stored plan; defaults to free when there is no subscription row.
		plan: r.status === 'active' && r.plan ? r.plan : 'free'
	}));

	return { users };
};
