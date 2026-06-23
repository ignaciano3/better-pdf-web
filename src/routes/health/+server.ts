import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return json({ status: 'ok', db: 'reachable' });
	} catch (err) {
		return json(
			{ status: 'error', db: 'unreachable', message: (err as Error).message },
			{ status: 503 }
		);
	}
};
