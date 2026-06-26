import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature, mapEventToRow, buildCheckoutPayload } from './lemonsqueezy';
import type { LemonSqueezyWebhook } from './types';

const SECRET = 'whsec_test';

function sign(body: string): string {
	return createHmac('sha256', SECRET).update(body).digest('hex');
}

function event(status: string, opts: Partial<{ name: string; userId: string; renews: string | null; ends: string | null; portal: string }> = {}): LemonSqueezyWebhook {
	return {
		meta: {
			event_name: opts.name ?? 'subscription_updated',
			custom_data: { user_id: opts.userId ?? 'user_1' }
		},
		data: {
			id: 'sub_123',
			attributes: {
				status,
				renews_at: opts.renews ?? '2026-08-01T00:00:00.000000Z',
				ends_at: opts.ends ?? null,
				urls: { customer_portal: opts.portal ?? 'https://store.lemonsqueezy.com/portal/abc' }
			}
		}
	};
}

describe('verifyWebhookSignature', () => {
	it('accepts a correct signature', () => {
		const body = '{"hello":"world"}';
		expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
	});

	it('rejects a tampered body', () => {
		const body = '{"hello":"world"}';
		const sig = sign(body);
		expect(verifyWebhookSignature('{"hello":"evil"}', sig, SECRET)).toBe(false);
	});

	it('rejects a missing signature', () => {
		expect(verifyWebhookSignature('{}', null, SECRET)).toBe(false);
	});

	it('rejects a wrong-length signature without throwing', () => {
		expect(verifyWebhookSignature('{}', 'abc', SECRET)).toBe(false);
	});

	it('rejects when the secret is empty (fail closed on misconfig)', () => {
		const body = '{"hello":"world"}';
		const sigWithEmptyKey = createHmac('sha256', '').update(body).digest('hex');
		expect(verifyWebhookSignature(body, sigWithEmptyKey, '')).toBe(false);
	});
});

describe('mapEventToRow', () => {
	it('grants active pro with renews_at as period end', () => {
		const row = mapEventToRow(event('active', { renews: '2026-08-01T00:00:00.000Z' }));
		expect(row).toEqual({
			userId: 'user_1',
			plan: 'pro',
			status: 'active',
			currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
			providerId: 'sub_123',
			manageUrl: 'https://store.lemonsqueezy.com/portal/abc'
		});
	});

	it('treats on_trial and past_due as active pro', () => {
		expect(mapEventToRow(event('on_trial'))?.status).toBe('active');
		expect(mapEventToRow(event('past_due'))?.status).toBe('active');
	});

	it('keeps pro active until ends_at on cancellation', () => {
		const row = mapEventToRow(event('cancelled', { ends: '2026-07-15T00:00:00.000Z' }));
		expect(row?.status).toBe('active');
		expect(row?.currentPeriodEnd).toEqual(new Date('2026-07-15T00:00:00.000Z'));
	});

	it('falls back to renews_at when a cancelled event has null ends_at (no fail-open)', () => {
		const row = mapEventToRow(
			event('cancelled', { ends: null, renews: '2026-09-01T00:00:00.000Z' })
		);
		expect(row?.status).toBe('active');
		expect(row?.currentPeriodEnd).toEqual(new Date('2026-09-01T00:00:00.000Z'));
		expect(row?.currentPeriodEnd).not.toBeNull();
	});

	it('marks expired/unpaid/paused as inactive', () => {
		expect(mapEventToRow(event('expired'))?.status).toBe('inactive');
		expect(mapEventToRow(event('unpaid'))?.status).toBe('inactive');
		expect(mapEventToRow(event('paused'))?.status).toBe('inactive');
	});

	it('returns null when user_id custom data is absent', () => {
		const e = event('active');
		e.meta.custom_data = {};
		expect(mapEventToRow(e)).toBeNull();
	});

	it('returns null for a non-subscription event', () => {
		expect(mapEventToRow(event('active', { name: 'order_created' }))).toBeNull();
	});

	it('returns null for an unknown status', () => {
		expect(mapEventToRow(event('something_new'))).toBeNull();
	});
});

describe('buildCheckoutPayload', () => {
	it('embeds store, variant, email and user_id custom data', () => {
		const payload = buildCheckoutPayload({
			storeId: '42',
			variantId: '999',
			userId: 'user_1',
			email: 'a@b.com'
		}) as any;
		expect(payload.data.type).toBe('checkouts');
		expect(payload.data.attributes.checkout_data.email).toBe('a@b.com');
		expect(payload.data.attributes.checkout_data.custom.user_id).toBe('user_1');
		expect(payload.data.relationships.store.data.id).toBe('42');
		expect(payload.data.relationships.variant.data.id).toBe('999');
	});
});

import { vi, beforeEach, afterEach } from 'vitest';

// $env/dynamic/private is virtual; provide a stub for tests.
vi.mock('$env/dynamic/private', () => ({
	env: {
		LEMONSQUEEZY_API_KEY: 'key_test',
		LEMONSQUEEZY_STORE_ID: '42',
		LEMONSQUEEZY_VARIANT_PRO_MONTHLY: '100',
		LEMONSQUEEZY_VARIANT_PRO_ANNUAL: '200'
	}
}));

describe('createCheckout', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('posts to the LS API and returns the checkout url', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: { attributes: { url: 'https://co.lemonsqueezy.com/abc' } } })
		});
		vi.stubGlobal('fetch', fetchMock);

		const { createCheckout } = await import('./lemonsqueezy');
		const result = await createCheckout({ userId: 'user_1', email: 'a@b.com', cadence: 'annual' });

		expect(result).toEqual({ url: 'https://co.lemonsqueezy.com/abc' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://api.lemonsqueezy.com/v1/checkouts');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer key_test');
		const body = JSON.parse(init.body);
		// annual cadence selects variant 200
		expect(body.data.relationships.variant.data.id).toBe('200');
	});

	it('throws when the LS API responds non-ok', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'bad' })
		);
		const { createCheckout } = await import('./lemonsqueezy');
		await expect(
			createCheckout({ userId: 'u', email: 'a@b.com', cadence: 'monthly' })
		).rejects.toThrow(/Lemon Squeezy checkout failed: 422/);
	});
});
