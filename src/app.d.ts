// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { auth } from '$lib/server/auth';

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: NonNullable<Session>['user'] | null;
			session: NonNullable<Session>['session'] | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
