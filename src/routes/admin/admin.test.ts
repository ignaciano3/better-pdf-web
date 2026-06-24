import { describe, it, expect } from 'vitest';
import { load } from './+page.server';

type LoadArg = Parameters<typeof load>[0];

describe('admin load gate', () => {
	it('returns 404 for an anonymous visitor (no DB touched)', async () => {
		await expect(load({ locals: { user: null, session: null } } as LoadArg)).rejects.toMatchObject({
			status: 404
		});
	});
});
