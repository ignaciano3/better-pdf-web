import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from '$env/dynamic/private';
import { getDb } from './db';
import * as schema from './db/schema';

// Lazy DB proxy: defers `getDb()` (and thus the DB connection) until the adapter
// actually performs a query. This keeps module import side-effect free, so the
// build's prerender analysis and tests can load this module without DATABASE_URL.
const lazyDb = new Proxy({} as ReturnType<typeof getDb>, {
	get(_target, prop, receiver) {
		return Reflect.get(getDb(), prop, receiver);
	}
});

// Only enable the Google provider when both credentials are present, so the app
// boots fine with the vars unset (e.g. local dev, CI). Real values come from env
// at runtime; `.env.example` documents the placeholders.
const googleClientId = env['GOOGLE_CLIENT_ID'];
const googleClientSecret = env['GOOGLE_CLIENT_SECRET'];
const googleProvider =
	googleClientId && googleClientSecret
		? {
				google: {
					clientId: googleClientId,
					clientSecret: googleClientSecret
				}
			}
		: undefined;

export const auth = betterAuth({
	database: drizzleAdapter(lazyDb, {
		provider: 'pg',
		schema
	}),
	// Real values come from env at runtime. Fallbacks exist purely so the module
	// can be constructed during the build's prerender analysis (which runs with no
	// env); they are never used to serve real requests.
	secret: env['BETTER_AUTH_SECRET'] ?? 'build-time-placeholder-secret-build-time-placeholder',
	baseURL: env['BETTER_AUTH_URL'] ?? 'http://localhost:5173',
	emailAndPassword: { enabled: true },
	...(googleProvider ? { socialProviders: googleProvider } : {}),
	// Built-in auth-abuse protection (NOT the product export limit). Throttles
	// requests to the auth endpoints per client.
	rateLimit: {
		enabled: true,
		window: 60,
		max: 20
	}
});
