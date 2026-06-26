import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/session';
import { createCheckout } from '$lib/server/billing/lemonsqueezy';
import type { Cadence } from '$lib/server/billing/types';
import type { RequestHandler } from './$types';

/**
 * Create a Lemon Squeezy checkout for the signed-in user and return its URL.
 * The client redirects the browser to that URL. Requires authentication so we
 * always have a user id + email to embed.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);

	const body = (await request.json().catch(() => ({}))) as { cadence?: string };
	const cadence: Cadence = body.cadence === 'monthly' ? 'monthly' : 'annual';

	if (!user.email) throw error(400, 'A verified email is required to check out');

	const { url } = await createCheckout({ userId: user.id, email: user.email, cadence });
	return json({ url });
};
