import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Populate locals with the current session/user so server load functions and
	// endpoints can read auth state without re-parsing cookies.
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Compose with Better Auth's handler — keep its wiring intact.
	return svelteKitHandler({ event, resolve, auth, building });
};
