import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * App-owned tables. Kept SEPARATE from `schema.ts` because that file is
 * regenerated wholesale by `npx auth@latest generate` (Better Auth) and any
 * app tables placed there would be clobbered. drizzle-kit and the runtime
 * client both merge this module with the generated one (see drizzle.config.ts
 * and db/index.ts).
 */

/**
 * Append-only ledger of rate-limited actions. One row is written per allowed
 * export. Counting rows within a time window drives the rate-limit decision.
 *
 * Either `userId` (logged-in) or `ipHash` (anonymous) identifies the actor;
 * both may be present but at least one is always set.
 */
export const usageEvent = pgTable(
	'usage_event',
	{
		id: text('id').primaryKey(),
		userId: text('user_id'),
		ipHash: text('ip_hash'),
		action: text('action').notNull(),
		tierAtTime: text('tier_at_time').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('usage_event_user_id_created_at_idx').on(table.userId, table.createdAt),
		index('usage_event_ip_hash_created_at_idx').on(table.ipHash, table.createdAt)
	]
);
