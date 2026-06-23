import { error } from '@sveltejs/kit';

/**
 * Guard for server load functions / endpoints that require authentication.
 * Returns the user when present, otherwise throws a 401. Reads the user from
 * `event.locals`, which `hooks.server.ts` populates from the Better Auth session.
 */
export function requireUser(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}
	return locals.user;
}
