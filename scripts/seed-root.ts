/**
 * Seed (or update) a `root`-plan user — the private, highest-privilege tier
 * (operator + invited friends; unlimited exports). Idempotent: re-running
 * upserts the user, the email/password credential, and the `root` subscription.
 *
 * Run with Bun (auto-loads `.env`, so DATABASE_URL is picked up):
 *
 *   ROOT_PASSWORD='your-strong-password' bun run seed:root
 *   # or override the email:
 *   ROOT_EMAIL=someone@example.com ROOT_PASSWORD='...' bun run seed:root
 *
 * Defaults: ROOT_EMAIL=ignaciogp08@gmail.com, ROOT_NAME=Root. DATABASE_URL must
 * point at the target Postgres. The password is hashed with better-auth's own
 * scrypt hasher, so the account signs in through the normal email/password flow.
 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import * as authSchema from '../src/lib/server/db/schema';
import * as appSchema from '../src/lib/server/db/schema.app';

const { user, account } = authSchema;
const { subscription } = appSchema;

const DEFAULT_EMAIL = 'ignaciogp08@gmail.com';

async function main(): Promise<void> {
	const url = process.env['DATABASE_URL'];
	if (!url) {
		console.error('DATABASE_URL is not set. Point it at the target Postgres and retry.');
		process.exit(1);
	}

	const email = (process.env['ROOT_EMAIL'] ?? DEFAULT_EMAIL).trim().toLowerCase();
	const name = process.env['ROOT_NAME'] ?? 'Root';
	const password = process.env['ROOT_PASSWORD'];
	if (!password || password.length < 8) {
		console.error('ROOT_PASSWORD is required and must be at least 8 characters.');
		process.exit(1);
	}

	const sql = postgres(url);
	const db = drizzle(sql, { schema: { ...authSchema, ...appSchema } });

	try {
		const now = new Date();
		const hash = await hashPassword(password);

		// 1. Upsert the user (by unique email).
		const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
		let userId = existing[0]?.id;
		if (userId) {
			await db
				.update(user)
				.set({ name, emailVerified: true, updatedAt: now })
				.where(eq(user.id, userId));
			console.log(`User exists (${email}) → ${userId}`);
		} else {
			userId = randomUUID();
			await db.insert(user).values({
				id: userId,
				name,
				email,
				emailVerified: true,
				createdAt: now,
				updatedAt: now
			});
			console.log(`Created user ${email} → ${userId}`);
		}

		// 2. Upsert the email/password credential account.
		const cred = await db
			.select()
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
			.limit(1);
		if (cred[0]) {
			await db
				.update(account)
				.set({ password: hash, updatedAt: now })
				.where(eq(account.id, cred[0].id));
			console.log('Credential updated (password reset).');
		} else {
			await db.insert(account).values({
				id: randomUUID(),
				accountId: userId,
				providerId: 'credential',
				userId,
				password: hash,
				createdAt: now,
				updatedAt: now
			});
			console.log('Credential created.');
		}

		// 3. Upsert the root subscription (no expiry).
		await db
			.insert(subscription)
			.values({ userId, plan: 'root', status: 'active', currentPeriodEnd: null })
			.onConflictDoUpdate({
				target: subscription.userId,
				set: { plan: 'root', status: 'active', currentPeriodEnd: null }
			});
		console.log("Subscription set to plan='root', status='active'.");

		console.log(`\nDone. Sign in with ${email} and your ROOT_PASSWORD.`);
	} finally {
		await sql.end();
	}
}

main().catch((e: unknown) => {
	console.error(e);
	process.exit(1);
});
