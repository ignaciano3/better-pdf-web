import { error, fail } from '@sveltejs/kit';
import { and, count, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { subscription, usageEvent } from '$lib/server/db/schema.app';
import { resolvePlan } from '$lib/server/plan';
import type { Actions, PageServerLoad } from './$types';

const PLANS = ['free', 'pro', 'root'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPORT_ACTION = 'export';

/** Throw 404 unless the caller is a root user (hides the page from everyone else). */
async function requireRoot(locals: App.Locals): Promise<NonNullable<App.Locals['user']>> {
	const current = locals.user;
	if (!current) error(404, 'Not found');
	if ((await resolvePlan(current.id)) !== 'root') error(404, 'Not found');
	return current;
}

/** Sum export events per user (optionally only since `since`) → { userId: count }. */
async function exportCounts(since?: Date): Promise<Record<string, number>> {
	const where = since
		? and(eq(usageEvent.action, EXPORT_ACTION), gte(usageEvent.createdAt, since))
		: eq(usageEvent.action, EXPORT_ACTION);
	const rows = await getDb()
		.select({ userId: usageEvent.userId, total: count() })
		.from(usageEvent)
		.where(where)
		.groupBy(usageEvent.userId);
	const out: Record<string, number> = {};
	for (const r of rows) if (r.userId) out[r.userId] = r.total;
	return out;
}

/**
 * Global export count across all actors — including anonymous (ipHash-only)
 * exports that never appear in the per-user table — within an optional window.
 */
async function exportTotal(since?: Date): Promise<number> {
	const where = since
		? and(eq(usageEvent.action, EXPORT_ACTION), gte(usageEvent.createdAt, since))
		: eq(usageEvent.action, EXPORT_ACTION);
	const rows = await getDb().select({ total: count() }).from(usageEvent).where(where);
	return rows[0]?.total ?? 0;
}

export const load: PageServerLoad = async ({ locals }) => {
	await requireRoot(locals);
	const db = getDb();

	const rows = await db
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

	const since24h = new Date(Date.now() - DAY_MS);
	const [allTime, last24h, exportsAllTime, exports24h] = await Promise.all([
		exportCounts(),
		exportCounts(since24h),
		exportTotal(),
		exportTotal(since24h)
	]);

	// Anonymous exports (ipHash-only) = global total minus the sum of per-user
	// counts, so the admin can see traffic that isn't attributed to any account.
	const attributed24h = Object.values(last24h).reduce((a, b) => a + b, 0);
	const attributedAll = Object.values(allTime).reduce((a, b) => a + b, 0);

	const users = rows.map((r) => ({
		id: r.id,
		name: r.name,
		email: r.email,
		emailVerified: r.emailVerified,
		createdAt: r.createdAt,
		// Stored plan; defaults to free when there is no active subscription row.
		plan: r.status === 'active' && r.plan ? r.plan : 'free',
		exportsTotal: allTime[r.id] ?? 0,
		exports24h: last24h[r.id] ?? 0
	}));

	const totals = { root: 0, pro: 0, free: 0 };
	for (const u of users) {
		if (u.plan === 'root') totals.root++;
		else if (u.plan === 'pro') totals.pro++;
		else totals.free++;
	}

	const usage = {
		exports24h,
		exportsAllTime,
		anon24h: Math.max(0, exports24h - attributed24h),
		anonAllTime: Math.max(0, exportsAllTime - attributedAll)
	};

	return { users, totals, usage };
};

export const actions: Actions = {
	/** Set a user's plan (free/pro/root). Root-only; refuses self-demotion. */
	setPlan: async ({ locals, request }) => {
		const current = await requireRoot(locals);
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const plan = String(form.get('plan') ?? '');

		if (!userId || !PLANS.includes(plan as (typeof PLANS)[number])) {
			return fail(400, { message: 'Invalid user or plan.' });
		}
		// Guard against locking yourself out of admin.
		if (userId === current.id && plan !== 'root') {
			return fail(400, { message: 'Refusing to remove your own root access.' });
		}

		await getDb()
			.insert(subscription)
			.values({ userId, plan, status: 'active', currentPeriodEnd: null })
			.onConflictDoUpdate({
				target: subscription.userId,
				set: { plan, status: 'active', currentPeriodEnd: null }
			});

		return { success: true, message: `Set ${userId} to ${plan}.` };
	}
};
