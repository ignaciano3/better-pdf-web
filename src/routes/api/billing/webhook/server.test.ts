import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec_test' }
}));

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
});
