import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LemonSqueezyWebhook, SubscriptionUpsert } from './types';
import { env } from '$env/dynamic/private';
import type { Cadence } from './types';

/** Event names we act on. Anything else (orders, etc.) is ignored. */
const SUBSCRIPTION_EVENTS = new Set([
	'subscription_created',
	'subscription_updated',
	'subscription_cancelled',
	'subscription_expired',
	'subscription_resumed',
	'subscription_paused',
	'subscription_unpaused'
]);

/** LS statuses that should grant pro (access lives until currentPeriodEnd). */
const ACTIVE_STATUSES = new Set(['active', 'on_trial', 'past_due']);
/** LS statuses that revoke pro. */
const INACTIVE_STATUSES = new Set(['expired', 'unpaid', 'paused']);

function parseDate(iso: string | null): Date | null {
	return iso ? new Date(iso) : null;
}

/**
 * Timing-safe HMAC-SHA256 check of the raw request body against the
 * `X-Signature` header. Returns false (never throws) on any mismatch,
 * missing signature, or length mismatch.
 */
export function verifyWebhookSignature(
	rawBody: string,
	signature: string | null,
	secret: string
): boolean {
	if (!secret) return false;
	if (!signature) return false;
	const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(signature, 'utf8');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * Map an LS subscription webhook to the row to upsert, or null to ignore.
 *
 * Drives off `attributes.status` (subscription_* events always carry the
 * current status). `cancelled` keeps the user pro+active but pins
 * currentPeriodEnd to `ends_at`, so `resolvePlan` expires access exactly when
 * the paid period runs out. Returns null when the event is not a subscription
 * event, the status is unrecognized, or no user_id custom data is present.
 */
export function mapEventToRow(event: LemonSqueezyWebhook): SubscriptionUpsert | null {
	if (!SUBSCRIPTION_EVENTS.has(event.meta.event_name)) return null;

	const userId = event.meta.custom_data?.user_id;
	if (!userId) return null;

	const attrs = event.data.attributes;
	const base = {
		userId,
		plan: 'pro' as const,
		providerId: event.data.id,
		manageUrl: attrs.urls?.customer_portal ?? null
	};

	if (attrs.status === 'cancelled') {
		return {
			...base,
			status: 'active',
			currentPeriodEnd: parseDate(attrs.ends_at ?? attrs.renews_at)
		};
	}
	if (ACTIVE_STATUSES.has(attrs.status)) {
		return { ...base, status: 'active', currentPeriodEnd: parseDate(attrs.renews_at) };
	}
	if (INACTIVE_STATUSES.has(attrs.status)) {
		return {
			...base,
			status: 'inactive',
			currentPeriodEnd: parseDate(attrs.ends_at ?? attrs.renews_at)
		};
	}
	return null;
}

const LS_API = 'https://api.lemonsqueezy.com/v1';

function variantIdFor(cadence: Cadence): string {
	const id =
		cadence === 'annual'
			? env['LEMONSQUEEZY_VARIANT_PRO_ANNUAL']
			: env['LEMONSQUEEZY_VARIANT_PRO_MONTHLY'];
	if (!id) throw new Error(`Missing LS variant id for cadence "${cadence}"`);
	return id;
}

/**
 * Create a Lemon Squeezy hosted checkout for the given user + cadence and
 * return its URL. The user's id is embedded as custom data so the webhook can
 * attribute the resulting subscription back to them.
 */
export async function createCheckout(args: {
	userId: string;
	email: string;
	cadence: Cadence;
}): Promise<{ url: string }> {
	const apiKey = env['LEMONSQUEEZY_API_KEY'];
	const storeId = env['LEMONSQUEEZY_STORE_ID'];
	if (!apiKey || !storeId) throw new Error('Lemon Squeezy is not configured');

	const payload = buildCheckoutPayload({
		storeId,
		variantId: variantIdFor(args.cadence),
		userId: args.userId,
		email: args.email
	});

	const res = await fetch(`${LS_API}/checkouts`, {
		method: 'POST',
		headers: {
			Accept: 'application/vnd.api+json',
			'Content-Type': 'application/vnd.api+json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify(payload)
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Lemon Squeezy checkout failed: ${res.status} ${detail}`);
	}

	const json = (await res.json()) as { data: { attributes: { url: string } } };
	return { url: json.data.attributes.url };
}

/**
 * Build the JSON:API request body for POST /v1/checkouts. `custom.user_id` is
 * echoed back to us in the webhook's `meta.custom_data`, letting us attribute
 * the subscription to the right user without email matching.
 */
export function buildCheckoutPayload(args: {
	storeId: string;
	variantId: string;
	userId: string;
	email: string;
}): object {
	return {
		data: {
			type: 'checkouts',
			attributes: {
				checkout_data: {
					email: args.email,
					custom: { user_id: args.userId }
				}
			},
			relationships: {
				store: { data: { type: 'stores', id: args.storeId } },
				variant: { data: { type: 'variants', id: args.variantId } }
			}
		}
	};
}
