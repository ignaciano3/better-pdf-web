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

/**
 * Append-only log of unexpected export failures. One row is written when
 * `buildPdf` throws something other than a `PdfBuildError` — i.e. a genuine
 * server-side bug (500), not an expected bad-input rejection (422). Used to
 * diagnose "export sometimes errors" reports after the fact.
 *
 * Metadata only: no document content is stored. The actor is identified the
 * same way as `usageEvent` — `userId` (logged-in) and/or `ipHash` (anonymous).
 */
export const exportError = pgTable(
	'export_error',
	{
		id: text('id').primaryKey(),
		userId: text('user_id'),
		ipHash: text('ip_hash'),
		tierAtTime: text('tier_at_time').notNull(),
		// Error class name (e.g. 'TypeError'); 'Error' when none is set.
		name: text('name').notNull(),
		message: text('message').notNull(),
		// Full stack trace when available; null otherwise.
		stack: text('stack'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('export_error_created_at_idx').on(table.createdAt)]
);

/**
 * Per-user subscription record. One row per user; absence of a row means the
 * user is on the free plan. Rows are written by the Lemon Squeezy webhook
 * handler (`/api/billing/webhook`). `providerId` holds the LS subscription id.
 *
 * `userId` is the primary key — at most one subscription per user.
 */
export const subscription = pgTable('subscription', {
	userId: text('user_id').primaryKey(),
	plan: text('plan').notNull().default('free'),
	status: text('status').notNull().default('active'),
	providerId: text('provider_id'),
	currentPeriodEnd: timestamp('current_period_end'),
	// Lemon Squeezy customer-portal URL for self-serve cancel / card update.
	// Null until a billing webhook populates it.
	manageUrl: text('manage_url')
});
