import postgres from 'postgres';

/**
 * Reset the rate-limit ledger before the suite runs.
 *
 * The anonymous cap (2 exports/hour) is enforced in Postgres by ip+fingerprint
 * over a 1-hour window. Across repeated local/CI runs the same IP would stay
 * blocked, so we TRUNCATE `usage_event` to start every run from an empty
 * window. (The rate-limit spec ALSO uses a unique per-run fingerprint as a
 * second layer of determinism.)
 */
export default async function globalSetup() {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error(
			'DATABASE_URL is not set. Create a .env at the worktree root (see README) before running e2e.'
		);
	}
	const sql = postgres(url);
	try {
		await sql`TRUNCATE TABLE usage_event`;
	} finally {
		await sql.end();
	}
}
