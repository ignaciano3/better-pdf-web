# Lemon Squeezy Pro Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users buy the Pro plan through Lemon Squeezy (merchant-of-record) so existing server-side gating unlocks automatically.

**Architecture:** The app creates checkouts server-side (embedding `user_id` as LS custom data) and processes LS subscription webhooks to upsert the `subscription` row. All existing gating (`resolvePlan` → `assertPro` → HTTP 402 → `/pricing`) is unchanged. Webhook events are normalized to the table's `status`/`currentPeriodEnd` columns so cancellation needs no special read-side logic.

**Tech Stack:** SvelteKit 2 (`+server.ts` endpoints, `$env/dynamic/private`), Drizzle ORM (Postgres), Better Auth (`requireUser`/`locals`), Vitest, Node `crypto` (HMAC).

## Global Constraints

- Server env access ONLY via `import { env } from '$env/dynamic/private'` and `env['KEY']` — never `process.env`. (Matches `db/index.ts`.)
- DB access ONLY via `getDb()` from `$lib/server/db`. Never instantiate Drizzle directly.
- App-owned tables live in `src/lib/server/db/schema.app.ts` (NOT `schema.ts`, which `auth generate` clobbers).
- Pure logic (no I/O, no clock beyond passed-in args) lives in testable modules with `.test.ts` siblings, following the `rate-limit.ts` pattern.
- Plan values are exactly `'free' | 'pro' | 'root'`; subscription `status` strings the read-side accepts as privileged is exactly `'active'`. Do not invent new status strings the read-side won't honor.
- Prices are USD: Pro $6/mo, $48/yr. Do not change copy/prices in this plan.
- LS API base: `https://api.lemonsqueezy.com/v1`. JSON:API content type: `application/vnd.api+json`.

---

## File Structure

- `src/lib/server/billing/lemonsqueezy.ts` (new) — pure helpers (`verifyWebhookSignature`, `mapEventToRow`, `buildCheckoutPayload`) + one network function (`createCheckout`). Mirrors the rate-limit "pure core, thin I/O" split.
- `src/lib/server/billing/lemonsqueezy.test.ts` (new) — unit tests for the pure helpers and `createCheckout` (fetch mocked).
- `src/lib/server/billing/types.ts` (new) — shared TS types for LS webhook payloads + the `SubscriptionUpsert` shape.
- `src/lib/server/db/schema.app.ts` (modify) — add `manageUrl` column.
- `src/routes/api/billing/checkout/+server.ts` (new) — authed POST that returns a checkout URL.
- `src/routes/api/billing/webhook/+server.ts` (new) — verifies signature, upserts subscription.
- `src/routes/api/billing/webhook/server.test.ts` (new) — signature-rejection unit test (no DB).
- `src/routes/+layout.server.ts` (modify) — surface `manageUrl` for the current user.
- `src/routes/pricing/+page.svelte` (modify) — wire real Upgrade buttons + Manage billing link.
- `.env.example` (modify) — document the 5 LS env vars.

---

## Task 1: Add `manageUrl` column to the subscription table

**Files:**
- Modify: `src/lib/server/db/schema.app.ts`
- Generate: a new file under `drizzle/` (created by `drizzle-kit generate`)

**Interfaces:**
- Produces: `subscription.manageUrl` (Drizzle column, `text`, nullable) consumed by Tasks 5 and 7.

- [ ] **Step 1: Add the column to the schema**

In `src/lib/server/db/schema.app.ts`, change the `subscription` table definition to add `manageUrl`. The final table is:

```ts
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
```

Also update the table's doc comment: replace the "#12 stub … rows are never written" sentence with: "Rows are written by the Lemon Squeezy webhook handler (`/api/billing/webhook`). `providerId` holds the LS subscription id."

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: drizzle-kit prints a new migration file path under `drizzle/` adding `manage_url`. No prompts (additive nullable column).

- [ ] **Step 3: Verify the generated SQL**

Open the new file under `drizzle/`. Confirm it contains `ADD COLUMN "manage_url" text` (and nothing destructive). If it proposes dropping/renaming anything, STOP and re-check Step 1.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.app.ts drizzle/
git commit -m "feat(billing): add subscription.manageUrl column for LS portal"
```

---

## Task 2: LS payload types

**Files:**
- Create: `src/lib/server/billing/types.ts`

**Interfaces:**
- Produces:
  - `LemonSqueezyWebhook` — parsed webhook shape consumed by `mapEventToRow` (Task 3) and the webhook route (Task 5).
  - `SubscriptionUpsert` — `{ userId: string; plan: 'pro'; status: 'active' | 'inactive'; currentPeriodEnd: Date | null; providerId: string; manageUrl: string | null }` consumed by Task 3 (return type) and Task 5 (upsert values).
  - `Cadence` — `'monthly' | 'annual'` consumed by Tasks 4 and 6.

- [ ] **Step 1: Write the types file**

Create `src/lib/server/billing/types.ts`:

```ts
/** Billing cadence requested at checkout. Selects the LS variant id. */
export type Cadence = 'monthly' | 'annual';

/**
 * The subset of a Lemon Squeezy subscription-webhook payload we rely on.
 * LS sends JSON:API; we only read these fields. `meta.custom_data.user_id`
 * is the value we injected at checkout (see buildCheckoutPayload).
 */
export interface LemonSqueezyWebhook {
	meta: {
		event_name: string;
		custom_data?: { user_id?: string };
	};
	data: {
		id: string; // LS subscription id
		attributes: {
			status: string; // active | on_trial | past_due | cancelled | expired | unpaid | paused
			renews_at: string | null; // ISO timestamp
			ends_at: string | null; // ISO timestamp
			urls?: { customer_portal?: string };
		};
	};
}

/**
 * Normalized row the webhook handler upserts into `subscription`. `status` is
 * deliberately limited to the read-side's privileged value ('active') or
 * 'inactive'; `resolvePlan` grants pro only on status='active' AND a
 * future currentPeriodEnd.
 */
export interface SubscriptionUpsert {
	userId: string;
	plan: 'pro';
	status: 'active' | 'inactive';
	currentPeriodEnd: Date | null;
	providerId: string;
	manageUrl: string | null;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors referencing `billing/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/billing/types.ts
git commit -m "feat(billing): add LS webhook + subscription-upsert types"
```

---

## Task 3: Pure billing helpers (signature, event mapping, checkout payload)

**Files:**
- Create: `src/lib/server/billing/lemonsqueezy.ts`
- Test: `src/lib/server/billing/lemonsqueezy.test.ts`

**Interfaces:**
- Consumes: `LemonSqueezyWebhook`, `SubscriptionUpsert` from `./types`.
- Produces:
  - `verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean`
  - `mapEventToRow(event: LemonSqueezyWebhook): SubscriptionUpsert | null`
  - `buildCheckoutPayload(args: { storeId: string; variantId: string; userId: string; email: string }): object`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/billing/lemonsqueezy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature, mapEventToRow, buildCheckoutPayload } from './lemonsqueezy';
import type { LemonSqueezyWebhook } from './types';

const SECRET = 'whsec_test';

function sign(body: string): string {
	return createHmac('sha256', SECRET).update(body).digest('hex');
}

function event(status: string, opts: Partial<{ name: string; userId: string; renews: string | null; ends: string | null; portal: string }> = {}): LemonSqueezyWebhook {
	return {
		meta: {
			event_name: opts.name ?? 'subscription_updated',
			custom_data: { user_id: opts.userId ?? 'user_1' }
		},
		data: {
			id: 'sub_123',
			attributes: {
				status,
				renews_at: opts.renews ?? '2026-08-01T00:00:00.000000Z',
				ends_at: opts.ends ?? null,
				urls: { customer_portal: opts.portal ?? 'https://store.lemonsqueezy.com/portal/abc' }
			}
		}
	};
}

describe('verifyWebhookSignature', () => {
	it('accepts a correct signature', () => {
		const body = '{"hello":"world"}';
		expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
	});

	it('rejects a tampered body', () => {
		const body = '{"hello":"world"}';
		const sig = sign(body);
		expect(verifyWebhookSignature('{"hello":"evil"}', sig, SECRET)).toBe(false);
	});

	it('rejects a missing signature', () => {
		expect(verifyWebhookSignature('{}', null, SECRET)).toBe(false);
	});

	it('rejects a wrong-length signature without throwing', () => {
		expect(verifyWebhookSignature('{}', 'abc', SECRET)).toBe(false);
	});
});

describe('mapEventToRow', () => {
	it('grants active pro with renews_at as period end', () => {
		const row = mapEventToRow(event('active', { renews: '2026-08-01T00:00:00.000Z' }));
		expect(row).toEqual({
			userId: 'user_1',
			plan: 'pro',
			status: 'active',
			currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
			providerId: 'sub_123',
			manageUrl: 'https://store.lemonsqueezy.com/portal/abc'
		});
	});

	it('treats on_trial and past_due as active pro', () => {
		expect(mapEventToRow(event('on_trial'))?.status).toBe('active');
		expect(mapEventToRow(event('past_due'))?.status).toBe('active');
	});

	it('keeps pro active until ends_at on cancellation', () => {
		const row = mapEventToRow(event('cancelled', { ends: '2026-07-15T00:00:00.000Z' }));
		expect(row?.status).toBe('active');
		expect(row?.currentPeriodEnd).toEqual(new Date('2026-07-15T00:00:00.000Z'));
	});

	it('marks expired/unpaid/paused as inactive', () => {
		expect(mapEventToRow(event('expired'))?.status).toBe('inactive');
		expect(mapEventToRow(event('unpaid'))?.status).toBe('inactive');
		expect(mapEventToRow(event('paused'))?.status).toBe('inactive');
	});

	it('returns null when user_id custom data is absent', () => {
		const e = event('active');
		e.meta.custom_data = {};
		expect(mapEventToRow(e)).toBeNull();
	});

	it('returns null for a non-subscription event', () => {
		expect(mapEventToRow(event('active', { name: 'order_created' }))).toBeNull();
	});

	it('returns null for an unknown status', () => {
		expect(mapEventToRow(event('something_new'))).toBeNull();
	});
});

describe('buildCheckoutPayload', () => {
	it('embeds store, variant, email and user_id custom data', () => {
		const payload = buildCheckoutPayload({
			storeId: '42',
			variantId: '999',
			userId: 'user_1',
			email: 'a@b.com'
		}) as any;
		expect(payload.data.type).toBe('checkouts');
		expect(payload.data.attributes.checkout_data.email).toBe('a@b.com');
		expect(payload.data.attributes.checkout_data.custom.user_id).toBe('user_1');
		expect(payload.data.relationships.store.data.id).toBe('42');
		expect(payload.data.relationships.variant.data.id).toBe('999');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/lib/server/billing/lemonsqueezy.test.ts`
Expected: FAIL — `verifyWebhookSignature`/`mapEventToRow`/`buildCheckoutPayload` not exported (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/server/billing/lemonsqueezy.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LemonSqueezyWebhook, SubscriptionUpsert } from './types';

/** Event names we act on. Anything else (orders, etc.) is ignored. */
const SUBSCRIPTION_EVENTS = new Set([
	'subscription_created',
	'subscription_updated',
	'subscription_cancelled',
	'subscription_expired',
	'subscription_resumed',
	'subscription_paused',
	'subscription_unpaused'
]);

/** LS statuses that should grant pro (access lives until currentPeriodEnd). */
const ACTIVE_STATUSES = new Set(['active', 'on_trial', 'past_due']);
/** LS statuses that revoke pro. */
const INACTIVE_STATUSES = new Set(['expired', 'unpaid', 'paused']);

function parseDate(iso: string | null): Date | null {
	return iso ? new Date(iso) : null;
}

/**
 * Timing-safe HMAC-SHA256 check of the raw request body against the
 * `X-Signature` header. Returns false (never throws) on any mismatch,
 * missing signature, or length mismatch.
 */
export function verifyWebhookSignature(
	rawBody: string,
	signature: string | null,
	secret: string
): boolean {
	if (!signature) return false;
	const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(signature, 'utf8');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * Map an LS subscription webhook to the row to upsert, or null to ignore.
 *
 * Drives off `attributes.status` (subscription_* events always carry the
 * current status). `cancelled` keeps the user pro+active but pins
 * currentPeriodEnd to `ends_at`, so `resolvePlan` expires access exactly when
 * the paid period runs out. Returns null when the event is not a subscription
 * event, the status is unrecognized, or no user_id custom data is present.
 */
export function mapEventToRow(event: LemonSqueezyWebhook): SubscriptionUpsert | null {
	if (!SUBSCRIPTION_EVENTS.has(event.meta.event_name)) return null;

	const userId = event.meta.custom_data?.user_id;
	if (!userId) return null;

	const attrs = event.data.attributes;
	const base = {
		userId,
		plan: 'pro' as const,
		providerId: event.data.id,
		manageUrl: attrs.urls?.customer_portal ?? null
	};

	if (attrs.status === 'cancelled') {
		return { ...base, status: 'active', currentPeriodEnd: parseDate(attrs.ends_at) };
	}
	if (ACTIVE_STATUSES.has(attrs.status)) {
		return { ...base, status: 'active', currentPeriodEnd: parseDate(attrs.renews_at) };
	}
	if (INACTIVE_STATUSES.has(attrs.status)) {
		return {
			...base,
			status: 'inactive',
			currentPeriodEnd: parseDate(attrs.ends_at ?? attrs.renews_at)
		};
	}
	return null;
}

/**
 * Build the JSON:API request body for POST /v1/checkouts. `custom.user_id` is
 * echoed back to us in the webhook's `meta.custom_data`, letting us attribute
 * the subscription to the right user without email matching.
 */
export function buildCheckoutPayload(args: {
	storeId: string;
	variantId: string;
	userId: string;
	email: string;
}): object {
	return {
		data: {
			type: 'checkouts',
			attributes: {
				checkout_data: {
					email: args.email,
					custom: { user_id: args.userId }
				}
			},
			relationships: {
				store: { data: { type: 'stores', id: args.storeId } },
				variant: { data: { type: 'variants', id: args.variantId } }
			}
		}
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --run src/lib/server/billing/lemonsqueezy.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/billing/lemonsqueezy.ts src/lib/server/billing/lemonsqueezy.test.ts
git commit -m "feat(billing): pure LS helpers (signature, event map, checkout payload)"
```

---

## Task 4: `createCheckout` network call + config

**Files:**
- Modify: `src/lib/server/billing/lemonsqueezy.ts` (add `createCheckout`)
- Modify: `src/lib/server/billing/lemonsqueezy.test.ts` (add `createCheckout` tests)

**Interfaces:**
- Consumes: `buildCheckoutPayload` (Task 3), `env` from `$env/dynamic/private`, `Cadence` from `./types`.
- Produces: `createCheckout(args: { userId: string; email: string; cadence: Cadence }): Promise<{ url: string }>` consumed by Task 5's checkout route.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/server/billing/lemonsqueezy.test.ts`:

```ts
import { vi, beforeEach, afterEach } from 'vitest';

// $env/dynamic/private is virtual; provide a stub for tests.
vi.mock('$env/dynamic/private', () => ({
	env: {
		LEMONSQUEEZY_API_KEY: 'key_test',
		LEMONSQUEEZY_STORE_ID: '42',
		LEMONSQUEEZY_VARIANT_PRO_MONTHLY: '100',
		LEMONSQUEEZY_VARIANT_PRO_ANNUAL: '200'
	}
}));

describe('createCheckout', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('posts to the LS API and returns the checkout url', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: { attributes: { url: 'https://co.lemonsqueezy.com/abc' } } })
		});
		vi.stubGlobal('fetch', fetchMock);

		const { createCheckout } = await import('./lemonsqueezy');
		const result = await createCheckout({ userId: 'user_1', email: 'a@b.com', cadence: 'annual' });

		expect(result).toEqual({ url: 'https://co.lemonsqueezy.com/abc' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.lemonsqueezy.com/v1/checkouts');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer key_test');
		const body = JSON.parse(init.body);
		// annual cadence selects variant 200
		expect(body.data.relationships.variant.data.id).toBe('200');
	});

	it('throws when the LS API responds non-ok', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'bad' })
		);
		const { createCheckout } = await import('./lemonsqueezy');
		await expect(
			createCheckout({ userId: 'u', email: 'a@b.com', cadence: 'monthly' })
		).rejects.toThrow(/Lemon Squeezy checkout failed: 422/);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/lib/server/billing/lemonsqueezy.test.ts`
Expected: FAIL — `createCheckout` not exported.

- [ ] **Step 3: Implement `createCheckout`**

Append to `src/lib/server/billing/lemonsqueezy.ts` (add the import at the top with the other imports):

```ts
import { env } from '$env/dynamic/private';
import type { Cadence } from './types';
```

```ts
const LS_API = 'https://api.lemonsqueezy.com/v1';

function variantIdFor(cadence: Cadence): string {
	const id =
		cadence === 'annual'
			? env['LEMONSQUEEZY_VARIANT_PRO_ANNUAL']
			: env['LEMONSQUEEZY_VARIANT_PRO_MONTHLY'];
	if (!id) throw new Error(`Missing LS variant id for cadence "${cadence}"`);
	return id;
}

/**
 * Create a Lemon Squeezy hosted checkout for the given user + cadence and
 * return its URL. The user's id is embedded as custom data so the webhook can
 * attribute the resulting subscription back to them.
 */
export async function createCheckout(args: {
	userId: string;
	email: string;
	cadence: Cadence;
}): Promise<{ url: string }> {
	const apiKey = env['LEMONSQUEEZY_API_KEY'];
	const storeId = env['LEMONSQUEEZY_STORE_ID'];
	if (!apiKey || !storeId) throw new Error('Lemon Squeezy is not configured');

	const payload = buildCheckoutPayload({
		storeId,
		variantId: variantIdFor(args.cadence),
		userId: args.userId,
		email: args.email
	});

	const res = await fetch(`${LS_API}/checkouts`, {
		method: 'POST',
		headers: {
			Accept: 'application/vnd.api+json',
			'Content-Type': 'application/vnd.api+json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify(payload)
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Lemon Squeezy checkout failed: ${res.status} ${detail}`);
	}

	const json = (await res.json()) as { data: { attributes: { url: string } } };
	return { url: json.data.attributes.url };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --run src/lib/server/billing/lemonsqueezy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/billing/lemonsqueezy.ts src/lib/server/billing/lemonsqueezy.test.ts
git commit -m "feat(billing): createCheckout LS API call with cadence variant select"
```

---

## Task 5: Checkout + webhook routes

**Files:**
- Create: `src/routes/api/billing/checkout/+server.ts`
- Create: `src/routes/api/billing/webhook/+server.ts`
- Test: `src/routes/api/billing/webhook/server.test.ts`

**Interfaces:**
- Consumes: `createCheckout`, `verifyWebhookSignature`, `mapEventToRow` (Tasks 3–4); `requireUser` (`$lib/server/session`); `getDb` (`$lib/server/db`); `subscription` (`$lib/server/db/schema.app`); `env`.
- Produces: HTTP endpoints. `POST /api/billing/checkout` → `{ url }`. `POST /api/billing/webhook` → 200/401.

- [ ] **Step 1: Write the failing webhook test (signature rejection, no DB)**

Create `src/routes/api/billing/webhook/server.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec_test' }
}));

// The route imports getDb; we should never reach it on a bad signature.
vi.mock('$lib/server/db', () => ({
	getDb: () => {
		throw new Error('DB must not be touched on invalid signature');
	}
}));

import { POST } from './+server';

function makeEvent(rawBody: string, signature: string | null) {
	return {
		request: new Request('http://localhost/api/billing/webhook', {
			method: 'POST',
			headers: signature ? { 'X-Signature': signature } : {},
			body: rawBody
		})
	} as any;
}

describe('POST /api/billing/webhook', () => {
	it('returns 401 for a missing/invalid signature and never touches the DB', async () => {
		const res = await POST(makeEvent('{"meta":{}}', 'deadbeef'));
		expect(res.status).toBe(401);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- --run src/routes/api/billing/webhook/server.test.ts`
Expected: FAIL — `./+server` not found.

- [ ] **Step 3: Implement the webhook route**

Create `src/routes/api/billing/webhook/+server.ts`:

```ts
import { json, text } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import { verifyWebhookSignature, mapEventToRow } from '$lib/server/billing/lemonsqueezy';
import type { LemonSqueezyWebhook } from '$lib/server/billing/types';
import type { RequestHandler } from './$types';

/**
 * Lemon Squeezy subscription webhook. Verifies the HMAC signature over the raw
 * body, maps the event to a subscription row, and upserts it. Idempotent: keyed
 * on userId, safe to replay. Returns 200 quickly; 401 on bad signature.
 */
export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.text();
	const signature = request.headers.get('X-Signature');
	const secret = env['LEMONSQUEEZY_WEBHOOK_SECRET'] ?? '';

	if (!verifyWebhookSignature(raw, signature, secret)) {
		return text('invalid signature', { status: 401 });
	}

	let event: LemonSqueezyWebhook;
	try {
		event = JSON.parse(raw);
	} catch {
		return text('invalid json', { status: 400 });
	}

	const row = mapEventToRow(event);
	if (!row) return json({ ignored: true }); // not a subscription event we act on

	await getDb()
		.insert(subscription)
		.values(row)
		.onConflictDoUpdate({
			target: subscription.userId,
			set: {
				plan: row.plan,
				status: row.status,
				currentPeriodEnd: row.currentPeriodEnd,
				providerId: row.providerId,
				manageUrl: row.manageUrl
			}
		});

	return json({ ok: true });
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- --run src/routes/api/billing/webhook/server.test.ts`
Expected: PASS (401, DB untouched).

- [ ] **Step 5: Implement the checkout route**

Create `src/routes/api/billing/checkout/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/session';
import { createCheckout } from '$lib/server/billing/lemonsqueezy';
import type { Cadence } from '$lib/server/billing/types';
import type { RequestHandler } from './$types';

/**
 * Create a Lemon Squeezy checkout for the signed-in user and return its URL.
 * The client redirects the browser to that URL. Requires authentication so we
 * always have a user id + email to embed.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);

	const body = (await request.json().catch(() => ({}))) as { cadence?: string };
	const cadence: Cadence = body.cadence === 'monthly' ? 'monthly' : 'annual';

	if (!user.email) throw error(400, 'A verified email is required to check out');

	const { url } = await createCheckout({ userId: user.id, email: user.email, cadence });
	return json({ url });
};
```

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no new errors in the two route files.

- [ ] **Step 7: Commit**

```bash
git add src/routes/api/billing/checkout/+server.ts src/routes/api/billing/webhook/+server.ts src/routes/api/billing/webhook/server.test.ts
git commit -m "feat(billing): checkout + webhook endpoints"
```

---

## Task 6: Surface `manageUrl` in layout data

**Files:**
- Modify: `src/routes/+layout.server.ts`

**Interfaces:**
- Consumes: `getDb`, `subscription`, `eq` (drizzle), existing `resolvePlan`.
- Produces: layout `data.manageUrl: string | null` consumed by Task 7's pricing page.

- [ ] **Step 1: Add manageUrl to the layout load**

Replace the body of `src/routes/+layout.server.ts` with:

```ts
import { eq } from 'drizzle-orm';
import { resolvePlan } from '$lib/server/plan';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Anonymous callers never hit the DB.
	if (!locals.user) {
		return { user: null, isRoot: false, manageUrl: null };
	}

	const plan = await resolvePlan(locals.user.id);

	// Only fetch the portal URL for paying users (root has no LS subscription).
	let manageUrl: string | null = null;
	if (plan === 'pro') {
		const rows = await getDb()
			.select({ manageUrl: subscription.manageUrl })
			.from(subscription)
			.where(eq(subscription.userId, locals.user.id))
			.limit(1);
		manageUrl = rows[0]?.manageUrl ?? null;
	}

	return { user: locals.user, isRoot: plan === 'root', manageUrl };
};
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors. `data.manageUrl` is available to pages.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.server.ts
git commit -m "feat(billing): surface LS manage-billing URL in layout data"
```

---

## Task 7: Wire pricing page (Upgrade buttons + Manage billing)

**Files:**
- Modify: `src/routes/pricing/+page.svelte`

**Interfaces:**
- Consumes: layout `data.user`, `data.manageUrl`; `POST /api/billing/checkout`.

- [ ] **Step 1: Add a checkout handler in the script block**

In `src/routes/pricing/+page.svelte`, inside `<script lang="ts">` after the existing `$derived` lines, add:

```ts
let upgrading = $state(false);

async function startCheckout() {
	if (upgrading) return;
	upgrading = true;
	try {
		const res = await fetch('/api/billing/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cadence: annual ? 'annual' : 'monthly' })
		});
		if (!res.ok) throw new Error(`Checkout failed (${res.status})`);
		const { url } = (await res.json()) as { url: string };
		window.location.href = url;
	} catch (e) {
		upgrading = false;
		alert('Could not start checkout. Please try again.');
		console.error(e);
	}
}
```

- [ ] **Step 2: Replace the Pro card's logged-in button**

In the Pro card, replace the `{#if data.user}` … `{:else}` block's logged-in branch (the disabled "Billing coming soon" button) with a real Upgrade button. The block becomes:

```svelte
{#if data.user}
	<button
		type="button"
		onclick={startCheckout}
		disabled={upgrading}
		class="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
	>
		{upgrading ? 'Starting checkout…' : 'Upgrade to Pro'}
	</button>
{:else}
	<a
		href={resolve('/signup')}
		class="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
	>
		Get started
	</a>
{/if}
```

- [ ] **Step 3: Add a Manage billing link when present**

Replace the footer paragraph at the bottom of `<main>` (the "Prices in USD. Billing integration is on the way…" `<p>`) with:

```svelte
{#if data.manageUrl}
	<p class="mt-8 text-center text-sm">
		<a href={data.manageUrl} class="font-medium text-blue-600 hover:underline">
			Manage billing
		</a>
	</p>
{/if}
<p class="mt-2 text-center text-xs text-gray-400">
	Prices in USD. Billing is handled securely by Lemon Squeezy.
</p>
```

- [ ] **Step 4: Type-check + lint**

Run: `npm run check && npm run lint`
Expected: no new errors. (If `prettier` reports formatting, run `npm run format` and re-stage.)

- [ ] **Step 5: Manual smoke (dev server, no real payment)**

Run: `npm run dev`, open `/pricing` while logged in. Confirm the Pro button now reads "Upgrade to Pro" and clicking it issues a POST to `/api/billing/checkout` (Network tab). Without LS env configured it will alert/fail — that is expected; Task 8 covers live validation.

- [ ] **Step 6: Commit**

```bash
git add src/routes/pricing/+page.svelte
git commit -m "feat(billing): wire Upgrade button and Manage billing link on pricing"
```

---

## Task 8: Document env vars + end-to-end LS test-mode validation

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Consumes: everything above. No new code.

- [ ] **Step 1: Document the env vars**

Append to `.env.example`:

```bash

# Lemon Squeezy billing (merchant-of-record). Use TEST-mode keys/store/variants
# while developing; switch to live values for production.
# API key: LS Dashboard → Settings → API.
LEMONSQUEEZY_API_KEY=""
# Store id (numeric): LS Dashboard → Settings → Stores.
LEMONSQUEEZY_STORE_ID=""
# Webhook signing secret: LS Dashboard → Settings → Webhooks (the secret you set
# when creating the webhook pointed at $BETTER_AUTH_URL/api/billing/webhook).
LEMONSQUEEZY_WEBHOOK_SECRET=""
# Variant ids (numeric) for the Pro product's monthly and annual prices.
LEMONSQUEEZY_VARIANT_PRO_MONTHLY=""
LEMONSQUEEZY_VARIANT_PRO_ANNUAL=""
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all billing tests green. Pre-existing `home.svelte.test.ts` health-check failures (3) are unrelated to this work and may remain.

- [ ] **Step 3: Configure LS test mode**

In the Lemon Squeezy dashboard (test mode ON):
1. Create a Pro product with two variants (monthly $6, annual $48). Copy both variant ids into `.env`.
2. Create an API key; copy into `LEMONSQUEEZY_API_KEY`. Copy the store id.
3. Start a tunnel: `npx cloudflared tunnel --url http://localhost:5173` (or ngrok). Copy the public URL.
4. Create a webhook in LS pointing at `<public-url>/api/billing/webhook`, subscribed to the `subscription_*` events. Set its signing secret; copy into `LEMONSQUEEZY_WEBHOOK_SECRET`.
5. Run migrations against your dev DB: `npm run db:migrate`.

- [ ] **Step 4: End-to-end happy path**

With `npm run dev` running behind the tunnel:
1. Log in, go to `/pricing`, click "Upgrade to Pro" → redirected to LS checkout.
2. Pay with an LS test card (`4242 4242 4242 4242`).
3. Confirm the webhook hit `/api/billing/webhook` (server logs) and a `subscription` row exists with `plan='pro', status='active', provider_id` set, `manage_url` set (check `npm run db:studio`).
4. Reload `/pricing` → "Manage billing" link appears. Trigger a pro-gated action and confirm it is no longer 402.

- [ ] **Step 5: End-to-end cancel path**

1. Open the Manage billing link, cancel the subscription in the LS portal.
2. Confirm a `subscription_cancelled` webhook arrived; the row stays `status='active'` but `current_period_end` is now the paid-through date.
3. Confirm pro access still works (period not yet ended). (Full expiry → free will occur naturally once `current_period_end` passes; no further action.)

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "docs(billing): document Lemon Squeezy env vars + test-mode setup"
```

---

## Notes for the implementer

- **Idempotency / replays:** LS may redeliver webhooks. The upsert is keyed on `userId`, so replays are harmless. Do not add an event-id dedupe table — YAGNI for v1.
- **Why status-driven mapping (not event-name):** subscription_* events always carry the current `attributes.status`, so one switch on status covers create/update/cancel/expire consistently and keeps `resolvePlan` unchanged. This matches the spec's intent (the spec's event table and this status table are equivalent).
- **Out of scope (do not build):** Day pass (one-off `order_created` + time-boxed entitlement), proration UI, dunning emails, multi-seat.
