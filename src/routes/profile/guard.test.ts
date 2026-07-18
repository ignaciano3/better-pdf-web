import { describe, it, expect } from 'vitest';
import { load } from './+page.server';

describe('profile load — auth guard', () => {
	it('redirects anonymous users (no locals.user) to /login', async () => {
		await expect(
			// Only locals.user is read before the redirect throws; a partial event is enough.
			(load as unknown as (e: { locals: { user: null } }) => Promise<unknown>)({
				locals: { user: null }
			})
		).rejects.toMatchObject({ status: 302, location: '/login' });
	});
});
