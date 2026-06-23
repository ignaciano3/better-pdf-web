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
		_db = drizzle(postgres(url), { schema });
	}
	return _db;
}
