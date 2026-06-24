import { resolvePlan } from '$lib/server/plan';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Surface a root flag so the header can show the Admin link. Anonymous
	// callers never hit the DB (resolvePlan returns 'free' for no user).
	const isRoot = locals.user ? (await resolvePlan(locals.user.id)) === 'root' : false;
	return { user: locals.user, isRoot };
};
