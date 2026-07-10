import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('$env/dynamic/private', () => ({
	env: { LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec_test' }
}));

vi.mock('$app/environment', () => ({ dev: false }));

// The route imports getDb; we should never reach it on a bad signature.
vi.mock('$lib/server/db', () => ({
	getDb: () => {
		throw new Error('DB must not be touched on invalid signature');
	}
}));

import { POST } from './+server';

function makeEvent(rawBody: string, signature: string | null) {
	return {
		request: new Request('http://localhost/api/billing/webhook', {
			method: 'POST',
			headers: signature ? { 'X-Signature': signature } : {},
			body: rawBody
		})
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/billing/webhook', () => {
	it('returns 401 for a missing/invalid signature and never touches the DB', async () => {
		const res = await POST(makeEvent('{"meta":{}}', 'deadbeef'));
		expect(res.status).toBe(401);
	});

	it('ignores test-mode events outside dev and never touches the DB', async () => {
		const raw = JSON.stringify({
			meta: {
				event_name: 'subscription_created',
				test_mode: true,
				custom_data: { user_id: 'u1' }
			},
			data: {
				id: 'sub_1',
				attributes: { status: 'active', renews_at: '2027-01-01T00:00:00Z', ends_at: null }
			}
		});
		const signature = createHmac('sha256', 'whsec_test').update(raw).digest('hex');

		const res = await POST(makeEvent(raw, signature));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ignored: true });
	});
});
