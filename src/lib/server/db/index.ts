import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

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
