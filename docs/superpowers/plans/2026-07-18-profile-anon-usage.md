# Profile Anonymous Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/profile` Usage section show the count the export gate actually enforces — the user's own in-window exports plus anonymous exports from the same browser (same IP + fingerprint) — as one combined number.

**Architecture:** Extract the load's usage computation into a shared `usageForActor` helper so the SSR load and a new remote query share one source of truth. The load renders the own-only count at SSR (no fingerprint server-side); a client-invoked remote query `getProfileUsage` receives the `localStorage` fingerprint and returns the combined own+anonymous count, which `+page.svelte` uses to refine the display.

**Tech Stack:** SvelteKit 2 remote functions (`$app/server` `query`), Svelte 5 runes, Drizzle (Postgres), vitest + `@testing-library/svelte`.

## Global Constraints

- Use **bun**, never npm/pnpm (`bun run ...`, `bunx ...`).
- Svelte 5 runes only (`$props`, `$state`, `$effect`) — no `export let`/stores in components.
- App-owned DB tables live in `src/lib/server/db/schema.app.ts`.
- Plans are exactly `'free' | 'pro' | 'root'` (`$lib/server/plan.ts`); `Plan` type is exported there.
- Export caps come from `CAPS` in `$lib/server/rate-limit.ts`; window is `WINDOW_MS` (3_600_000 ms). `windowStart(now)` is exported there.
- The anonymous actor id is `ipHash = sha256(clientIP | fingerprint)`, resolved by `resolveIdentity(event, fingerprint)` (`$lib/server/identity.ts`); the fingerprint lives in `localStorage` under `bpw:fingerprint`.
- The profile page must NOT mint a fingerprint (read-only `localStorage.getItem`); only the editor mints one.
- Format touched files with prettier; scope prettier/eslint to touched files only (repo isn't prettier-clean overall).

---

### Task 1: Shared `usageForActor` helper + load refactor

Extract the load's inline "count → usageView → resetAt" block into one shared, DB-touching helper so the SSR load and the new query (Task 2) cannot diverge. Then repoint the load at it (own-only, unchanged behavior).

**Files:**
- Modify: `src/lib/server/usage-count.ts` (add `usageForActor`)
- Create: `src/lib/server/usage-for-actor.test.ts`
- Modify: `src/routes/profile/+page.server.ts` (use `usageForActor`, drop the inline usage block + now-unused imports)

**Interfaces:**
- Consumes: `countInWindow`, `windowWhere` (same module), `usageView` (`$lib/server/profile-usage`), `Plan` (`$lib/server/plan`), `windowStart`, `WINDOW_MS` (`$lib/server/rate-limit`), `getDb` (`$lib/server/db`), `usageEvent` (`$lib/server/db/schema.app`).
- Produces: `usageForActor(userId: string | undefined, ipHash: string | undefined, plan: Plan, now: Date): Promise<{ used: number; limit: number | null; resetAt: string | null }>` — consumed by the load and by Task 2's query.

- [ ] **Step 1: Write the failing test**

`src/lib/server/usage-for-actor.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WINDOW_MS } from './rate-limit';

// Fake Drizzle client shared by both queries usageForActor issues:
//  - countInWindow:  select({value:count()}).from().where()            -> [{ value }]
//  - resetAt oldest: select({createdAt}).from().where().orderBy().limit() -> oldestRows
// `.where()` returns a thenable that resolves to the count rows AND carries
// `.orderBy().limit()` for the oldest-event path.
let countValue: number;
let oldestRows: { createdAt: Date }[];

vi.mock('$lib/server/db', () => ({
	getDb: () => ({
		select: () => ({
			from: () => ({
				where: () => {
					const rows = Promise.resolve([{ value: countValue }]);
					return Object.assign(rows, {
						orderBy: () => ({ limit: () => Promise.resolve(oldestRows) })
					});
				}
			})
		})
	})
}));

import { usageForActor } from './usage-count';

beforeEach(() => {
	countValue = 0;
	oldestRows = [];
});

const now = new Date('2026-07-18T12:30:00.000Z');

describe('usageForActor', () => {
	it('free plan under the cap: finite limit, no resetAt', async () => {
		countValue = 3;
		expect(await usageForActor('u1', undefined, 'free', now)).toEqual({
			used: 3,
			limit: 5,
			resetAt: null
		});
	});

	it('free plan at the cap: resetAt = oldest in-window event + WINDOW_MS', async () => {
		countValue = 5;
		const oldest = new Date('2026-07-18T12:00:00.000Z');
		oldestRows = [{ createdAt: oldest }];
		expect(await usageForActor('u1', 'h1', 'free', now)).toEqual({
			used: 5,
			limit: 5,
			resetAt: new Date(oldest.getTime() + WINDOW_MS).toISOString()
		});
	});

	it('pro plan: unlimited (limit null), never a resetAt', async () => {
		countValue = 42;
		expect(await usageForActor('u1', undefined, 'pro', now)).toEqual({
			used: 42,
			limit: null,
			resetAt: null
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/server/usage-for-actor.test.ts`
Expected: FAIL — `usageForActor` is not exported from `./usage-count`.

- [ ] **Step 3: Add `usageForActor` to the helper**

In `src/lib/server/usage-count.ts`, add these imports at the top (alongside the existing ones):

```ts
import { usageView } from './profile-usage';
import type { Plan } from './plan';
```

Change the existing rate-limit import to also bring in `WINDOW_MS`:

```ts
import { windowStart, WINDOW_MS } from './rate-limit';
```

Then append this function to the module:

```ts
/**
 * Resolve an actor's in-window usage view for display: their count (own events,
 * plus anonymous events by ipHash when one is given), the plan's limit, and —
 * only when capped out — when the oldest in-window event ages out (resetAt).
 * Serialized (resetAt as an ISO string or null) so it crosses load/query
 * boundaries cleanly. Single source of truth for the profile load and the
 * `getProfileUsage` remote query.
 */
export async function usageForActor(
	userId: string | undefined,
	ipHash: string | undefined,
	plan: Plan,
	now: Date
): Promise<{ used: number; limit: number | null; resetAt: string | null }> {
	const used = await countInWindow(userId, ipHash, now);
	const view = usageView(plan, used);

	let resetAt: string | null = null;
	if (view.limit !== null && view.used >= view.limit) {
		const db = getDb();
		const oldest = await db
			.select({ createdAt: usageEvent.createdAt })
			.from(usageEvent)
			.where(windowWhere(userId, ipHash, windowStart(now)))
			.orderBy(usageEvent.createdAt)
			.limit(1);
		const t = oldest[0]?.createdAt;
		resetAt = t ? new Date(t.getTime() + WINDOW_MS).toISOString() : null;
	}
	return { used: view.used, limit: view.limit, resetAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- --run src/lib/server/usage-for-actor.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Repoint the load at `usageForActor`**

Replace the entire contents of `src/routes/profile/+page.server.ts` with:

```ts
import { redirect } from '@sveltejs/kit';
import { eq, isNotNull, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import { account } from '$lib/server/db/schema';
import { resolvePlan } from '$lib/server/plan';
import { usageForActor } from '$lib/server/usage-count';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	const userId = locals.user.id;
	const db = getDb();

	const plan = await resolvePlan(userId);

	// Subscription details (absent for free/root).
	const subRows = await db
		.select({
			status: subscription.status,
			currentPeriodEnd: subscription.currentPeriodEnd,
			manageUrl: subscription.manageUrl
		})
		.from(subscription)
		.where(eq(subscription.userId, userId))
		.limit(1);
	const sub = subRows[0];

	// hasPassword: a credential account row with a non-null password exists.
	const pwRows = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), isNotNull(account.password)))
		.limit(1);
	const hasPassword = pwRows.length > 0;

	// Usage in the current window — own events only at SSR (no fingerprint
	// server-side); the client refines to the combined own+anonymous count via
	// the getProfileUsage remote query.
	const usage = await usageForActor(userId, undefined, plan, new Date());

	return {
		email: locals.user.email,
		name: locals.user.name ?? '',
		emailVerified: locals.user.emailVerified ?? false,
		plan,
		hasPassword,
		subscription: {
			status: sub?.status ?? null,
			currentPeriodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
			manageUrl: sub?.manageUrl ?? null
		},
		usage
	};
};
```

- [ ] **Step 6: Typecheck + existing usage-count tests + prettier/eslint**

Run: `bun run check && bun run test:unit -- --run src/lib/server/usage-count.test.ts src/lib/server/usage-for-actor.test.ts && bunx prettier --write src/lib/server/usage-count.ts src/routes/profile/+page.server.ts src/lib/server/usage-for-actor.test.ts && bunx eslint src/lib/server/usage-count.ts src/routes/profile/+page.server.ts src/lib/server/usage-for-actor.test.ts`
Expected: 0 type errors; all tests pass; prettier writes cleanly; eslint 0 errors. (The load's return shape is unchanged, so `check` confirms nothing downstream broke.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/usage-count.ts src/lib/server/usage-for-actor.test.ts src/routes/profile/+page.server.ts
git commit -m "refactor(profile): extract usageForActor shared by load and query"
```

---

### Task 2: `getProfileUsage` remote query + `parseFingerprint`

Add the client-invokable remote query that returns the combined count, plus a small pure fingerprint validator it depends on (unit-testable without loading `$app/server`).

**Files:**
- Create: `src/lib/server/fingerprint.ts`
- Create: `src/lib/server/fingerprint.test.ts`
- Create: `src/routes/profile/usage.remote.ts`

**Interfaces:**
- Consumes: `error` (`@sveltejs/kit`); `query`, `getRequestEvent` (`$app/server`); `resolveIdentity` (`$lib/server/identity`); `resolvePlan` (`$lib/server/plan`); `usageForActor` (Task 1); `parseFingerprint` (this task).
- Produces:
  - `parseFingerprint(input: unknown): string` — extracts `input.fingerprint`, throws HTTP 422 if missing/empty/non-string/over-256.
  - `getProfileUsage` — a remote `query` called as `getProfileUsage({ fingerprint })`, returning `{ used: number; limit: number | null; resetAt: string | null }`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test for `parseFingerprint`**

`src/lib/server/fingerprint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFingerprint } from './fingerprint';

/** Run `fn`, returning the HTTP status of the error it throws (fails if none). */
function thrownStatus(fn: () => unknown): number {
	try {
		fn();
	} catch (e) {
		return (e as { status: number }).status;
	}
	throw new Error('expected parseFingerprint to throw, but it returned');
}

describe('parseFingerprint', () => {
	it('returns the fingerprint for a valid payload', () => {
		expect(parseFingerprint({ fingerprint: 'abc123' })).toBe('abc123');
	});

	it('rejects an empty fingerprint with 422', () => {
		expect(thrownStatus(() => parseFingerprint({ fingerprint: '' }))).toBe(422);
	});

	it('rejects a non-string fingerprint with 422', () => {
		expect(thrownStatus(() => parseFingerprint({ fingerprint: 123 }))).toBe(422);
	});

	it('rejects a null payload with 422', () => {
		expect(thrownStatus(() => parseFingerprint(null))).toBe(422);
	});

	it('rejects an over-long (>256) fingerprint with 422', () => {
		expect(thrownStatus(() => parseFingerprint({ fingerprint: 'x'.repeat(257) }))).toBe(422);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/server/fingerprint.test.ts`
Expected: FAIL — cannot resolve `./fingerprint`.

- [ ] **Step 3: Implement `parseFingerprint`**

`src/lib/server/fingerprint.ts`:

```ts
import { error } from '@sveltejs/kit';

/** Max accepted fingerprint length (mirrors the export gate's own limit). */
const MAX_FINGERPRINT_LEN = 256;

/**
 * Extract and validate the client fingerprint from a remote-function payload.
 * Throws HTTP 422 for a missing, empty, non-string, or over-long value. Keeps
 * the profile usage query's validation in lockstep with the export gate.
 */
export function parseFingerprint(input: unknown): string {
	const fingerprint = (input as { fingerprint?: unknown } | null)?.fingerprint;
	if (
		typeof fingerprint !== 'string' ||
		fingerprint.length === 0 ||
		fingerprint.length > MAX_FINGERPRINT_LEN
	) {
		error(422, 'Invalid fingerprint');
	}
	return fingerprint;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- --run src/lib/server/fingerprint.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Implement the remote query**

`src/routes/profile/usage.remote.ts`:

```ts
import { query, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { resolveIdentity } from '$lib/server/identity';
import { resolvePlan } from '$lib/server/plan';
import { usageForActor } from '$lib/server/usage-count';
import { parseFingerprint } from '$lib/server/fingerprint';

/**
 * Combined in-window export usage for the logged-in user: their own events plus
 * anonymous events from the same browser (same IP + fingerprint), matching what
 * the export gate enforces. The profile load renders the own-only count at SSR
 * (no fingerprint server-side); the client calls this with the localStorage
 * fingerprint to refine the display to the enforced number.
 *
 * `'unchecked'` mirrors the export gate command; input is validated by
 * `parseFingerprint`. Identity is taken from the session — never from client
 * input beyond the fingerprint — so a caller can only ever surface counts
 * already keyed to their own IP+fingerprint.
 */
export const getProfileUsage = query('unchecked', async (input: unknown) => {
	const fingerprint = parseFingerprint(input);
	const event = getRequestEvent();
	if (!event.locals.user) error(401, 'Not authenticated');
	const userId = event.locals.user.id;
	const identity = resolveIdentity(event, fingerprint);
	const plan = await resolvePlan(userId);
	return usageForActor(identity.userId, identity.ipHash, plan, new Date());
});
```

- [ ] **Step 6: Typecheck + fingerprint tests + prettier/eslint**

Run: `bun run check && bun run test:unit -- --run src/lib/server/fingerprint.test.ts && bunx prettier --write src/lib/server/fingerprint.ts src/lib/server/fingerprint.test.ts src/routes/profile/usage.remote.ts && bunx eslint src/lib/server/fingerprint.ts src/lib/server/fingerprint.test.ts src/routes/profile/usage.remote.ts`
Expected: 0 type errors (confirms the `query('unchecked', …)` signature and `usageForActor`/`resolveIdentity` wiring compile); tests pass; prettier/eslint clean. (The query itself is verified by typecheck + Task 3's client test — remote functions have no unit-test precedent in this repo; they are exercised end-to-end by the existing rate-limit e2e.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/fingerprint.ts src/lib/server/fingerprint.test.ts src/routes/profile/usage.remote.ts
git commit -m "feat(profile): getProfileUsage remote query for combined usage"
```

---

### Task 3: Client refinement in `+page.svelte`

Wire the page to read the existing browser fingerprint and refine the SSR own-only usage to the combined count. `UsageSection.svelte` is unchanged.

**Files:**
- Modify: `src/routes/profile/+page.svelte`
- Create: `src/routes/profile/+page.svelte.test.ts`

**Interfaces:**
- Consumes: `getProfileUsage` (Task 2), the load's `data` (Task 1's return shape), the four existing section components.
- Produces: the finished feature (no downstream consumers).

- [ ] **Step 1: Write the failing test**

`src/routes/profile/+page.svelte.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

const getProfileUsage = vi.fn(async () => ({ used: 5, limit: 5, resetAt: null }));
vi.mock('./usage.remote', () => ({ getProfileUsage }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$lib/auth-client', () => ({
	authClient: {
		updateUser: vi.fn(async () => ({ error: null })),
		changePassword: vi.fn(async () => ({ error: null })),
		revokeOtherSessions: vi.fn(async () => ({ error: null }))
	}
}));

import Page from './+page.svelte';

const data = {
	email: 'ada@example.com',
	name: 'Ada',
	emailVerified: true,
	plan: 'free' as const,
	hasPassword: true,
	subscription: { status: null, currentPeriodEnd: null, manageUrl: null },
	usage: { used: 3, limit: 5, resetAt: null }
};

beforeEach(() => {
	localStorage.clear();
	getProfileUsage.mockClear();
});

describe('profile page — usage refinement', () => {
	it('refines the SSR own-only count to the combined count using the fingerprint', async () => {
		localStorage.setItem('bpw:fingerprint', 'fp-123');
		const { getByText, findByText } = render(Page, { props: { data } });
		// SSR own-only value renders first.
		expect(getByText(/3\s*\/\s*5/)).toBeTruthy();
		// Then the client refines to the combined count.
		expect(await findByText(/5\s*\/\s*5/)).toBeTruthy();
		expect(getProfileUsage).toHaveBeenCalledWith({ fingerprint: 'fp-123' });
	});

	it('keeps the SSR value and does not query when no fingerprint is stored', async () => {
		const { getByText } = render(Page, { props: { data } });
		expect(getByText(/3\s*\/\s*5/)).toBeTruthy();
		expect(getProfileUsage).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/routes/profile/+page.svelte.test.ts`
Expected: FAIL — the page does not import/call `getProfileUsage`, so the refinement assertion (`5 / 5`) never appears / the mock is never called.

- [ ] **Step 3: Wire the refinement into the page**

Replace the contents of `src/routes/profile/+page.svelte` with:

```svelte
<script lang="ts">
	import AccountSection from './AccountSection.svelte';
	import SubscriptionSection from './SubscriptionSection.svelte';
	import UsageSection from './UsageSection.svelte';
	import SecuritySection from './SecuritySection.svelte';
	import { getProfileUsage } from './usage.remote';

	let { data } = $props();

	// SSR renders the own-only count; refine to the combined own+anonymous count
	// (what the export gate enforces) once the browser fingerprint is available.
	// One-time capture is intentional — a later invalidateAll (e.g. after a name
	// change) must not clobber the refined figure.
	// svelte-ignore state_referenced_locally
	let usage = $state(data.usage);

	$effect(() => {
		// Read-only: never mint a fingerprint here (a fresh id matches no events);
		// an absent key means this browser has no anonymous exports, so own-only
		// is already correct.
		const fingerprint = localStorage.getItem('bpw:fingerprint');
		if (!fingerprint) return;
		getProfileUsage({ fingerprint })
			.then((refined) => {
				usage = refined;
			})
			.catch(() => {
				// Usage display is non-critical; keep the SSR own-only value on failure.
			});
	});
</script>

<svelte:head><title>Your profile — Better PDF Web</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-2xl font-semibold text-slate-900">Your profile</h1>
	<AccountSection
		name={data.name}
		email={data.email}
		emailVerified={data.emailVerified}
		hasPassword={data.hasPassword}
	/>
	<SubscriptionSection
		plan={data.plan}
		status={data.subscription.status}
		currentPeriodEnd={data.subscription.currentPeriodEnd}
		manageUrl={data.subscription.manageUrl}
	/>
	<UsageSection used={usage.used} limit={usage.limit} resetAt={usage.resetAt} />
	<SecuritySection />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- --run src/routes/profile/+page.svelte.test.ts`
Expected: PASS (both cases). Confirm no `state_referenced_locally` (or other) Svelte warning appears in the output.

- [ ] **Step 5: Full check + suite + prettier/eslint**

Run: `bun run check && bun run test:unit -- --run && bunx prettier --write src/routes/profile/+page.svelte src/routes/profile/+page.svelte.test.ts && bunx eslint src/routes/profile/+page.svelte src/routes/profile/+page.svelte.test.ts`
Expected: 0 type errors; full suite passes; prettier/eslint clean.

- [ ] **Step 6: Manually verify (optional, needs DB)**

Run `bun run dev`; as a logged-in user who previously exported anonymously from the same browser, open `/profile`. Confirm the Usage number briefly shows the own-only value then updates to the combined count matching the editor's export gate.

- [ ] **Step 7: Commit**

```bash
git add src/routes/profile/+page.svelte src/routes/profile/+page.svelte.test.ts
git commit -m "feat(profile): refine usage to combined own+anonymous count client-side"
```

---

## Self-Review

**Spec coverage:**
- Shared `usageForActor` (prevents load/query drift) → Task 1.
- Load stays own-only, refactored onto the helper → Task 1.
- `getProfileUsage` remote query (combined count, fingerprint-validated, auth-guarded) → Task 2.
- Fingerprint validation seam → Task 2 (`parseFingerprint`, unit-tested).
- Client refinement via read-only `localStorage` fingerprint + `$effect` → Task 3.
- One combined number, `UsageSection` unchanged → Task 3.
- Testing: `usageForActor` branching (fake DB), `parseFingerprint` (422 cases), client refinement + no-fingerprint fallback (mocked `./usage.remote`) → Tasks 1–3. Remote query itself verified by typecheck (no remote-fn unit-test precedent; covered e2e by the existing rate-limit spec). ✓
- Out of scope (breakdown UI, changing the editor's fingerprint minting, `UsageSection` markup, new live-DB e2e) → intentionally absent. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected outcomes. ✓

**Type consistency:** `usageForActor(userId, ipHash, plan, now) → { used, limit, resetAt }` is defined in Task 1 and consumed identically by the load (Task 1) and the query (Task 2). `getProfileUsage({ fingerprint })` returning `{ used, limit, resetAt }` (Task 2) matches the client call and `usage` state shape (Task 3). `parseFingerprint(input: unknown): string` (Task 2) matches its test and the query's use. The load's return shape is byte-identical to before (only the usage block's provenance changed), so downstream props in `+page.svelte` are unaffected. ✓

## Notes for the implementer

- Remote functions require `experimental.remoteFunctions` (already enabled in `vite.config.ts`) and the `.remote.ts` suffix — `usage.remote.ts` co-located under `src/routes/profile/` is correct, mirroring `src/routes/editor/gate.remote.ts`.
- In Task 3's test, `./usage.remote` is fully replaced by `vi.mock`, so its `$app/server` import is never evaluated in jsdom — this is why the client test can render the page without a server runtime.
- `$effect` never runs during SSR, so the `localStorage` read is client-only and safe.
