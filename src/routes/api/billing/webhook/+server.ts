import { json, text } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import { verifyWebhookSignature, mapEventToRow } from '$lib/server/billing/lemonsqueezy';
import type { LemonSqueezyWebhook } from '$lib/server/billing/types';
import type { RequestHandler } from './$types';

/**
 * Lemon Squeezy subscription webhook. Verifies the HMAC signature over the raw
 * body, maps the event to a subscription row, and upserts it. Idempotent: keyed
 * on userId, safe to replay. Returns 200 quickly; 401 on bad signature.
 */
export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.text();
	const signature = request.headers.get('X-Signature');
	const secret = env['LEMONSQUEEZY_WEBHOOK_SECRET'] ?? '';

	if (!verifyWebhookSignature(raw, signature, secret)) {
		return text('invalid signature', { status: 401 });
	}

	let event: LemonSqueezyWebhook;
	try {
		event = JSON.parse(raw);
	} catch {
		return text('invalid json', { status: 400 });
	}

	// A test-mode webhook pointed at production (with a matching secret) must
	// not be able to grant pro. Test events are only honored in dev.
	if (event.meta?.test_mode && !dev) return json({ ignored: true });

	const row = mapEventToRow(event);
	if (!row) return json({ ignored: true }); // not a subscription event we act on

	await getDb()
		.insert(subscription)
		.values(row)
		.onConflictDoUpdate({
			target: subscription.userId,
			set: {
				plan: row.plan,
				status: row.status,
				currentPeriodEnd: row.currentPeriodEnd,
				providerId: row.providerId,
				manageUrl: row.manageUrl
			}
		});

	return json({ ok: true });
};
