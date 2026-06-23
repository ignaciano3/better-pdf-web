import { describe, it, expect } from 'vitest';
import { requireUser } from './session';

// A minimal user shape; requireUser only cares about presence + identity.
const user = { id: 'u1', email: 'a@b.com' } as unknown as NonNullable<App.Locals['user']>;

describe('requireUser', () => {
	it('returns the user when locals carry one', () => {
		const locals = { user, session: null } as App.Locals;
		expect(requireUser(locals)).toBe(user);
	});

	it('throws a 401 when no user is present', () => {
		const locals = { user: null, session: null } as App.Locals;
		expect(() => requireUser(locals)).toThrowError(expect.objectContaining({ status: 401 }));
	});
});
