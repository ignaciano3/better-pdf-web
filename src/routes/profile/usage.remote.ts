import { query, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { resolveIdentity } from '$lib/server/identity';
import { resolvePlan } from '$lib/server/plan';
import { usageForActor } from '$lib/server/usage-count';
import { parseFingerprint } from '$lib/server/fingerprint';

/**
 * Combined in-window export usage for the logged-in user: their own events plus
 * anonymous events from the same browser (same IP + fingerprint), matching what
 * the export gate enforces. The profile load renders the own-only count at SSR
 * (no fingerprint server-side); the client calls this with the localStorage
 * fingerprint to refine the display to the enforced number.
 *
 * `'unchecked'` mirrors the export gate command; input is validated by
 * `parseFingerprint`. Identity is taken from the session — never from client
 * input beyond the fingerprint — so a caller can only ever surface counts
 * already keyed to their own IP+fingerprint.
 */
export const getProfileUsage = query('unchecked', async (input: unknown) => {
	const fingerprint = parseFingerprint(input);
	const event = getRequestEvent();
	if (!event.locals.user) error(401, 'Not authenticated');
	const userId = event.locals.user.id;
	const identity = resolveIdentity(event, fingerprint);
	const plan = await resolvePlan(userId);
	return usageForActor(identity.userId, identity.ipHash, plan, new Date());
});
