import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as authSchema from './schema';
import * as appSchema from './schema.app';

// Merge the generated Better Auth tables with the app-owned tables so the
// runtime client knows about both. `schema.ts` is regenerated wholesale by
// `auth generate`, so app tables live in `schema.app.ts` and are merged here.
const schema = { ...authSchema, ...appSchema };

let _db: PostgresJsDatabase<typeof schema> | undefined;

/**
 * Lazily create the Drizzle client on first use. Deferring connection until
 * first query keeps module import side-effect free, so tests and tooling that
 * pull this module into their graph don't require DATABASE_URL to be set.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
	if (!_db) {
		const url = env['DATABASE_URL'];
		if (!url) throw new Error('DATABASE_URL is not set');
		// Netlify Functions are serverless: each invocation is a short-lived
		// container, so we keep one connection per instance and let it idle out
		// quickly instead of holding a pool. Point DATABASE_URL at Neon's
		// *pooled* endpoint (PgBouncer, transaction mode); that pooler rejects
		// prepared statements, hence `prepare: false`.
		const client = postgres(url, {
			max: 1,
			idle_timeout: 20,
			connect_timeout: 10,
			prepare: false
		});
		_db = drizzle(client, { schema });
	}
	return _db;
}
