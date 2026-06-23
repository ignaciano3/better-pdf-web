import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await getDb().execute(sql`select 1`);
		return json({ status: 'ok', db: 'reachable' });
	} catch (err) {
		// Log details server-side only; never reflect internal error text to clients.
		console.error('[health] db check failed:', err);
		return json({ status: 'error', db: 'unreachable' }, { status: 503 });
	}
};
