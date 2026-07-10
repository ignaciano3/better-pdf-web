/** Billing cadence requested at checkout. Selects the LS variant id. */
export type Cadence = 'monthly' | 'annual';

/**
 * The subset of a Lemon Squeezy subscription-webhook payload we rely on.
 * LS sends JSON:API; we only read these fields. `meta.custom_data.user_id`
 * is the value we injected at checkout (see buildCheckoutPayload).
 */
export interface LemonSqueezyWebhook {
	meta: {
		event_name: string;
		test_mode?: boolean;
		custom_data?: { user_id?: string };
	};
	data: {
		id: string; // LS subscription id
		attributes: {
			status: string; // active | on_trial | past_due | cancelled | expired | unpaid | paused
			renews_at: string | null; // ISO timestamp
			ends_at: string | null; // ISO timestamp
			urls?: { customer_portal?: string };
		};
	};
}

/**
 * Normalized row the webhook handler upserts into `subscription`. `status` is
 * deliberately limited to the read-side's privileged value ('active') or
 * 'inactive'; `resolvePlan` grants pro only on status='active' AND a
 * future currentPeriodEnd.
 */
export interface SubscriptionUpsert {
	userId: string;
	plan: 'pro';
	status: 'active' | 'inactive';
	currentPeriodEnd: Date | null;
	providerId: string;
	manageUrl: string | null;
}
