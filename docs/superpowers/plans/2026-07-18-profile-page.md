# Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/profile` page where logged-in users manage their account, subscription, usage, and sessions.

**Architecture:** A guarded SvelteKit route (`src/routes/profile/`) whose `+page.server.ts` load resolves plan, subscription, usage, and whether the user has a password, then renders four focused section components. Account/security mutations run client-side through the existing `authClient` (same pattern as login/signup), refreshing loaded data via `invalidateAll()`. Usage counting is extracted from the export gate into a shared server helper so the two callers cannot drift.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), better-auth (`$lib/auth-client`), Drizzle (Postgres), Tailwind v4, vitest + `@testing-library/svelte`.

## Global Constraints

- Use **bun**, never npm/pnpm (`bun run ...`, `bunx ...`).
- Svelte 5 runes only (`$props`, `$state`, `$derived`, `$effect`) — no legacy `export let` / stores in components.
- App-owned DB tables live in `src/lib/server/db/schema.app.ts`, never in the generated `schema.ts`.
- Plans are exactly `'free' | 'pro' | 'root'` (`$lib/server/plan.ts`).
- Export caps come from `CAPS` in `$lib/server/rate-limit.ts` (`anonymous: 2, free: 5, pro/root: Infinity`); window is `WINDOW_MS` (1 hour).
- Mutations use `authClient` methods and call `invalidateAll()` on success; inline error text + pending state on every control (mirror `src/routes/login/+page.svelte`).
- Tailwind utility classes for styling; match the existing slate/blue palette used in `Header.svelte`.

---

### Task 1: Extract shared usage-count helper

Relocate the window-matching SQL and in-window count out of the export gate into a shared module so the profile load and the gate share one source of truth. Pure relocation — no behaviour change.

**Files:**
- Create: `src/lib/server/usage-count.ts`
- Create: `src/lib/server/usage-count.test.ts`
- Modify: `src/routes/editor/gate.remote.ts` (remove local `windowWhere` / `countInWindow`, import them instead)

**Interfaces:**
- Consumes: `usageEvent` (`$lib/server/db/schema.app`), `windowStart` (`$lib/server/rate-limit`), Drizzle `and/eq/gte/isNull/or/count`, `getDb` (`$lib/server/db`).
- Produces:
  - `EXPORT_ACTION: 'export'` (string const)
  - `windowWhere(userId: string | undefined, ipHash: string | undefined, since: Date): SQL | undefined`
  - `countInWindow(userId: string | undefined, ipHash: string | undefined, now: Date): Promise<number>`

- [ ] **Step 1: Write the failing test**

`src/lib/server/usage-count.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { and, eq, gte, isNull, or } from 'drizzle-orm';
import { windowWhere, EXPORT_ACTION } from './usage-count';
import { usageEvent } from './db/schema.app';
import { windowStart } from './rate-limit';

const since = windowStart(new Date('2026-07-18T12:00:00Z'));

describe('windowWhere', () => {
	it('matches the action constant', () => {
		expect(EXPORT_ACTION).toBe('export');
	});

	it('for a logged-in user matches own userId OR anonymous ipHash events', () => {
		const expected = and(
			eq(usageEvent.action, EXPORT_ACTION),
			or(eq(usageEvent.userId, 'u1'), and(isNull(usageEvent.userId), eq(usageEvent.ipHash, 'h1'))),
			gte(usageEvent.createdAt, since)
		);
		expect(windowWhere('u1', 'h1', since)).toEqual(expected);
	});

	it('for an anonymous actor matches only the anonymous ipHash branch', () => {
		const expected = and(
			eq(usageEvent.action, EXPORT_ACTION),
			and(isNull(usageEvent.userId), eq(usageEvent.ipHash, 'h1')),
			gte(usageEvent.createdAt, since)
		);
		expect(windowWhere(undefined, 'h1', since)).toEqual(expected);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/server/usage-count.test.ts`
Expected: FAIL — cannot resolve `./usage-count`.

- [ ] **Step 3: Create the helper**

`src/lib/server/usage-count.ts`:

```ts
import { and, count, eq, gte, isNull, or, type SQL } from 'drizzle-orm';
import { getDb } from './db';
import { usageEvent } from './db/schema.app';
import { windowStart } from './rate-limit';

/** The single rate-limited action recorded in `usage_event`. */
export const EXPORT_ACTION = 'export';

/**
 * SQL predicate matching an actor's in-window export events: their own
 * authenticated events, plus anonymous events by ipHash. Mirrors
 * `countsTowardWindow` in `usage-window.ts`.
 */
export function windowWhere(
	userId: string | undefined,
	ipHash: string | undefined,
	since: Date
): SQL | undefined {
	const anonMatch = and(isNull(usageEvent.userId), eq(usageEvent.ipHash, ipHash!));
	const who = userId ? or(eq(usageEvent.userId, userId), anonMatch) : anonMatch;
	return and(eq(usageEvent.action, EXPORT_ACTION), who, gte(usageEvent.createdAt, since));
}

/** Count an actor's prior export events in the current window. */
export async function countInWindow(
	userId: string | undefined,
	ipHash: string | undefined,
	now: Date
): Promise<number> {
	const db = getDb();
	const rows = await db
		.select({ value: count() })
		.from(usageEvent)
		.where(windowWhere(userId, ipHash, windowStart(now)));
	return rows[0]?.value ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- --run src/lib/server/usage-count.test.ts`
Expected: PASS.

- [ ] **Step 5: Point the gate at the shared helper**

In `src/routes/editor/gate.remote.ts`:
- Delete the local `EXPORT_ACTION` const, the `windowWhere` function, and the `countInWindow` function.
- Add import: `import { windowWhere, countInWindow, EXPORT_ACTION } from '$lib/server/usage-count';`
- Remove now-unused imports from `drizzle-orm` that were only used by the deleted functions (keep any still referenced by `nextExportAllowedAt`, which uses `usageEvent` ordering only — it references `windowWhere`, so it keeps working). Leave `nextExportAllowedAt` as-is.

- [ ] **Step 6: Run the gate's tests + typecheck**

Run: `bun run test:unit -- --run src/routes/editor/ && bun run check`
Expected: PASS, no type errors. (Confirms the relocation kept the gate working.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/usage-count.ts src/lib/server/usage-count.test.ts src/routes/editor/gate.remote.ts
git commit -m "refactor: extract shared usage-count helper from export gate"
```

---

### Task 2: Profile load — auth guard, subscription, usage, hasPassword

Build the server load that gathers everything the page renders. Guards anonymous users, resolves plan + subscription, computes usage against the cap, and derives whether a password is set (email/password account vs Google-only).

**Files:**
- Create: `src/routes/profile/+page.server.ts`
- Create: `src/lib/server/profile-usage.ts` (pure limit/reset derivation, unit-tested)
- Create: `src/lib/server/profile-usage.test.ts`

**Interfaces:**
- Consumes: `countInWindow` (Task 1), `resolvePlan` (`$lib/server/plan`), `CAPS`, `WINDOW_MS`, `windowStart` (`$lib/server/rate-limit`), `getDb`, `subscription` + `usageEvent` (schema.app), `account` (`$lib/server/db/schema`), `redirect` (`@sveltejs/kit`).
- Produces (`profile-usage.ts`):
  - `usageView(plan: Plan, used: number): { used: number; limit: number | null }` — `limit` is `null` for unlimited (pro/root).
- Produces (load return shape, consumed by Task 3):
  ```ts
  {
    email: string;
    name: string;
    emailVerified: boolean;
    plan: 'free' | 'pro' | 'root';
    hasPassword: boolean;
    subscription: { status: string | null; currentPeriodEnd: string | null; manageUrl: string | null };
    usage: { used: number; limit: number | null; resetAt: string | null };
  }
  ```
  Dates are serialized as ISO strings (or null) so they cross the load boundary cleanly.

- [ ] **Step 1: Write the failing test for `usageView`**

`src/lib/server/profile-usage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { usageView } from './profile-usage';

describe('usageView', () => {
	it('free plan reports the finite cap', () => {
		expect(usageView('free', 3)).toEqual({ used: 3, limit: 5 });
	});

	it('pro plan reports no limit (null)', () => {
		expect(usageView('pro', 42)).toEqual({ used: 42, limit: null });
	});

	it('root plan reports no limit (null)', () => {
		expect(usageView('root', 0)).toEqual({ used: 0, limit: null });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/server/profile-usage.test.ts`
Expected: FAIL — cannot resolve `./profile-usage`.

- [ ] **Step 3: Implement `usageView`**

`src/lib/server/profile-usage.ts`:

```ts
import { CAPS } from './rate-limit';
import type { Plan } from './plan';

/**
 * Map a plan + used-count onto a display view. `limit` is null when the plan's
 * cap is unbounded (pro/root, modelled as Infinity in CAPS).
 */
export function usageView(plan: Plan, used: number): { used: number; limit: number | null } {
	const cap = CAPS[plan === 'root' ? 'root' : plan === 'pro' ? 'pro' : 'free'];
	return { used, limit: Number.isFinite(cap) ? cap : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- --run src/lib/server/profile-usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the load**

`src/routes/profile/+page.server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import { eq, isNotNull, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema.app';
import { account } from '$lib/server/db/schema';
import { resolvePlan } from '$lib/server/plan';
import { countInWindow } from '$lib/server/usage-count';
import { usageView } from '$lib/server/profile-usage';
import { windowStart, WINDOW_MS } from '$lib/server/rate-limit';
import { usageEvent } from '$lib/server/db/schema.app';
import { windowWhere } from '$lib/server/usage-count';
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

	// Usage in the current window.
	const now = new Date();
	const used = await countInWindow(userId, undefined, now);
	const view = usageView(plan, used);

	// resetAt: when the oldest in-window event ages out (only meaningful when capped).
	let resetAt: string | null = null;
	if (view.limit !== null && used >= view.limit) {
		const oldest = await db
			.select({ createdAt: usageEvent.createdAt })
			.from(usageEvent)
			.where(windowWhere(userId, undefined, windowStart(now)))
			.orderBy(usageEvent.createdAt)
			.limit(1);
		const t = oldest[0]?.createdAt;
		resetAt = t ? new Date(t.getTime() + WINDOW_MS).toISOString() : null;
	}

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
		usage: { used: view.used, limit: view.limit, resetAt }
	};
};
```

- [ ] **Step 6: Typecheck**

Run: `bun run check`
Expected: PASS, no type errors (confirms the load compiles against `$types` and the schema).

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/profile-usage.ts src/lib/server/profile-usage.test.ts src/routes/profile/+page.server.ts
git commit -m "feat(profile): server load for account, subscription, and usage"
```

---

### Task 3: AccountSection — name, email, change password

Editable display name, read-only email with a verified badge, and a change-password form shown only when the user has a password.

**Files:**
- Create: `src/routes/profile/AccountSection.svelte`
- Create: `src/routes/profile/AccountSection.svelte.test.ts`

**Interfaces:**
- Consumes: `authClient` (`$lib/auth-client`), `invalidateAll` (`$app/navigation`), props `{ name: string; email: string; emailVerified: boolean; hasPassword: boolean }`.
- Produces: a self-contained section component used by Task 6's `+page.svelte`.

- [ ] **Step 1: Write the failing test**

`src/routes/profile/AccountSection.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$lib/auth-client', () => ({
	authClient: {
		updateUser: vi.fn(async () => ({ error: null })),
		changePassword: vi.fn(async () => ({ error: null }))
	}
}));

import AccountSection from './AccountSection.svelte';

const base = { name: 'Ada', email: 'ada@example.com', emailVerified: true };

describe('AccountSection', () => {
	it('shows the email and a Verified badge when verified', () => {
		const { getByText } = render(AccountSection, { props: { ...base, hasPassword: true } });
		expect(getByText('ada@example.com')).toBeTruthy();
		expect(getByText(/verified/i)).toBeTruthy();
	});

	it('renders the change-password form when hasPassword is true', () => {
		const { getByLabelText } = render(AccountSection, { props: { ...base, hasPassword: true } });
		expect(getByLabelText(/current password/i)).toBeTruthy();
		expect(getByLabelText(/new password/i)).toBeTruthy();
	});

	it('hides change-password and shows the Google note when hasPassword is false', () => {
		const { queryByLabelText, getByText } = render(AccountSection, {
			props: { ...base, hasPassword: false }
		});
		expect(queryByLabelText(/current password/i)).toBeNull();
		expect(getByText(/signed in with google/i)).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/routes/profile/AccountSection.svelte.test.ts`
Expected: FAIL — cannot resolve `./AccountSection.svelte`.

- [ ] **Step 3: Implement the component**

`src/routes/profile/AccountSection.svelte`:

```svelte
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';

	let {
		name,
		email,
		emailVerified,
		hasPassword
	}: { name: string; email: string; emailVerified: boolean; hasPassword: boolean } = $props();

	let nameValue = $state(name);
	let nameError = $state<string | null>(null);
	let nameSaving = $state(false);
	let nameSaved = $state(false);

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		nameError = null;
		nameSaved = false;
		nameSaving = true;
		const result = await authClient.updateUser({ name: nameValue });
		nameSaving = false;
		if (result.error) {
			nameError = result.error.message ?? 'Could not update name.';
			return;
		}
		nameSaved = true;
		await invalidateAll();
	}

	let currentPassword = $state('');
	let newPassword = $state('');
	let pwError = $state<string | null>(null);
	let pwSaving = $state(false);
	let pwSaved = $state(false);

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		pwError = null;
		pwSaved = false;
		pwSaving = true;
		const result = await authClient.changePassword({ currentPassword, newPassword });
		pwSaving = false;
		if (result.error) {
			pwError = result.error.message ?? 'Could not change password.';
			return;
		}
		pwSaved = true;
		currentPassword = '';
		newPassword = '';
	}
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Account</h2>

	<form onsubmit={saveName} class="mb-6 space-y-2">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Display name</span>
			<input
				type="text"
				bind:value={nameValue}
				autocomplete="name"
				class="w-full max-w-sm rounded-md border-slate-300"
			/>
		</label>
		{#if nameError}<p class="text-sm text-red-700">{nameError}</p>{/if}
		{#if nameSaved}<p class="text-sm text-green-700">Saved.</p>{/if}
		<button
			type="submit"
			disabled={nameSaving}
			class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
		>
			{nameSaving ? 'Saving…' : 'Save name'}
		</button>
	</form>

	<div class="mb-6">
		<span class="mb-1 block text-sm font-medium text-slate-700">Email</span>
		<p class="flex items-center gap-2 text-slate-900">
			{email}
			{#if emailVerified}
				<span
					class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-green-700 uppercase"
					>Verified</span
				>
			{/if}
		</p>
	</div>

	{#if hasPassword}
		<form onsubmit={changePassword} class="space-y-2">
			<h3 class="text-sm font-semibold text-slate-800">Change password</h3>
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Current password</span>
				<input
					type="password"
					bind:value={currentPassword}
					required
					autocomplete="current-password"
					class="w-full max-w-sm rounded-md border-slate-300"
				/>
			</label>
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">New password</span>
				<input
					type="password"
					bind:value={newPassword}
					required
					autocomplete="new-password"
					class="w-full max-w-sm rounded-md border-slate-300"
				/>
			</label>
			{#if pwError}<p class="text-sm text-red-700">{pwError}</p>{/if}
			{#if pwSaved}<p class="text-sm text-green-700">Password changed.</p>{/if}
			<button
				type="submit"
				disabled={pwSaving}
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
			>
				{pwSaving ? 'Changing…' : 'Change password'}
			</button>
		</form>
	{:else}
		<p class="text-sm text-slate-500">Signed in with Google — no password to manage.</p>
	{/if}
</section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- --run src/routes/profile/AccountSection.svelte.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/routes/profile/AccountSection.svelte src/routes/profile/AccountSection.svelte.test.ts
git commit -m "feat(profile): account section with name and password controls"
```

---

### Task 4: SubscriptionSection — plan, renewal, manage/upgrade

Shows the plan badge and the right billing control per plan: upgrade CTA (free), manage + renewal (pro), label only (root).

**Files:**
- Create: `src/routes/profile/SubscriptionSection.svelte`
- Create: `src/routes/profile/SubscriptionSection.svelte.test.ts`

**Interfaces:**
- Consumes: props `{ plan: 'free' | 'pro' | 'root'; status: string | null; currentPeriodEnd: string | null; manageUrl: string | null }`, `resolve` (`$app/paths`) for the `/pricing` link.
- Produces: a self-contained section component for Task 6.

- [ ] **Step 1: Write the failing test**

`src/routes/profile/SubscriptionSection.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SubscriptionSection from './SubscriptionSection.svelte';

describe('SubscriptionSection', () => {
	it('free plan shows an Upgrade link to pricing', () => {
		const { getByRole } = render(SubscriptionSection, {
			props: { plan: 'free', status: null, currentPeriodEnd: null, manageUrl: null }
		});
		const link = getByRole('link', { name: /upgrade/i });
		expect(link.getAttribute('href')).toContain('/pricing');
	});

	it('pro plan shows the renewal date and a Manage link', () => {
		const { getByText, getByRole } = render(SubscriptionSection, {
			props: {
				plan: 'pro',
				status: 'active',
				currentPeriodEnd: '2026-08-18T00:00:00.000Z',
				manageUrl: 'https://portal.example.com/x'
			}
		});
		expect(getByText(/renews/i)).toBeTruthy();
		expect(getByRole('link', { name: /manage subscription/i }).getAttribute('href')).toBe(
			'https://portal.example.com/x'
		);
	});

	it('root plan shows a label and no billing controls', () => {
		const { queryByRole, getByText } = render(SubscriptionSection, {
			props: { plan: 'root', status: null, currentPeriodEnd: null, manageUrl: null }
		});
		expect(getByText(/root/i)).toBeTruthy();
		expect(queryByRole('link', { name: /upgrade|manage/i })).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/routes/profile/SubscriptionSection.svelte.test.ts`
Expected: FAIL — cannot resolve `./SubscriptionSection.svelte`.

- [ ] **Step 3: Implement the component**

`src/routes/profile/SubscriptionSection.svelte`:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		plan,
		status,
		currentPeriodEnd,
		manageUrl
	}: {
		plan: 'free' | 'pro' | 'root';
		status: string | null;
		currentPeriodEnd: string | null;
		manageUrl: string | null;
	} = $props();

	const renewLabel = $derived(
		currentPeriodEnd
			? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: null
	);
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<div class="mb-4 flex items-center gap-3">
		<h2 class="text-lg font-semibold text-slate-900">Subscription</h2>
		<span
			class="rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase"
			class:bg-slate-100={plan === 'free'}
			class:text-slate-600={plan === 'free'}
			class:bg-blue-100={plan === 'pro'}
			class:text-blue-700={plan === 'pro'}
			class:bg-purple-100={plan === 'root'}
			class:text-purple-700={plan === 'root'}
		>
			{plan}
		</span>
	</div>

	{#if plan === 'free'}
		<p class="mb-4 text-sm text-slate-600">
			You're on the free plan (5 exports/hour). Upgrade for unlimited exports.
		</p>
		<a
			href={resolve('/pricing')}
			class="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
		>
			Upgrade to Pro
		</a>
	{:else if plan === 'pro'}
		<p class="mb-1 text-sm text-slate-600">Status: {status ?? 'active'}</p>
		{#if renewLabel}
			<p class="mb-4 text-sm text-slate-600">Renews {renewLabel}</p>
		{/if}
		{#if manageUrl}
			<a
				href={manageUrl}
				target="_blank"
				rel="noopener"
				class="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
			>
				Manage subscription
			</a>
		{/if}
	{:else}
		<p class="text-sm text-slate-600">
			You have a <strong>root</strong> plan — unlimited access, no billing.
		</p>
	{/if}
</section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- --run src/routes/profile/SubscriptionSection.svelte.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/routes/profile/SubscriptionSection.svelte src/routes/profile/SubscriptionSection.svelte.test.ts
git commit -m "feat(profile): subscription section with plan-specific controls"
```

---

### Task 5: UsageSection + SecuritySection

The usage meter and the "sign out everywhere" control. Two small components in one task — each is trivial and neither justifies a separate reviewer gate.

**Files:**
- Create: `src/routes/profile/UsageSection.svelte`
- Create: `src/routes/profile/UsageSection.svelte.test.ts`
- Create: `src/routes/profile/SecuritySection.svelte`
- Create: `src/routes/profile/SecuritySection.svelte.test.ts`

**Interfaces:**
- `UsageSection` consumes props `{ used: number; limit: number | null; resetAt: string | null }`.
- `SecuritySection` consumes `authClient` (`$lib/auth-client`), no props.
- Both produce self-contained section components for Task 6.

- [ ] **Step 1: Write the failing UsageSection test**

`src/routes/profile/UsageSection.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import UsageSection from './UsageSection.svelte';

describe('UsageSection', () => {
	it('shows used / limit for a capped plan', () => {
		const { getByText } = render(UsageSection, {
			props: { used: 3, limit: 5, resetAt: null }
		});
		expect(getByText(/3\s*\/\s*5/)).toBeTruthy();
	});

	it('shows Unlimited when limit is null', () => {
		const { getByText } = render(UsageSection, {
			props: { used: 42, limit: null, resetAt: null }
		});
		expect(getByText(/unlimited/i)).toBeTruthy();
	});

	it('mentions a reset time when capped out', () => {
		const { getByText } = render(UsageSection, {
			props: { used: 5, limit: 5, resetAt: '2026-07-18T13:00:00.000Z' }
		});
		expect(getByText(/resets/i)).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit -- --run src/routes/profile/UsageSection.svelte.test.ts`
Expected: FAIL — cannot resolve `./UsageSection.svelte`.

- [ ] **Step 3: Implement UsageSection**

`src/routes/profile/UsageSection.svelte`:

```svelte
<script lang="ts">
	let {
		used,
		limit,
		resetAt
	}: { used: number; limit: number | null; resetAt: string | null } = $props();

	const resetLabel = $derived(
		resetAt ? new Date(resetAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
	);
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Usage</h2>
	{#if limit === null}
		<p class="text-slate-900"><span class="font-semibold">Unlimited</span> exports.</p>
	{:else}
		<p class="text-slate-900">
			<span class="font-semibold">{used} / {limit}</span> exports used this hour.
		</p>
		{#if resetLabel && used >= limit}
			<p class="mt-1 text-sm text-slate-500">Resets around {resetLabel}.</p>
		{/if}
	{/if}
</section>
```

- [ ] **Step 4: Run to verify UsageSection passes**

Run: `bun run test:unit -- --run src/routes/profile/UsageSection.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing SecuritySection test**

`src/routes/profile/SecuritySection.svelte.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';

const revokeOtherSessions = vi.fn(async () => ({ error: null }));
vi.mock('$lib/auth-client', () => ({ authClient: { revokeOtherSessions } }));

import SecuritySection from './SecuritySection.svelte';

describe('SecuritySection', () => {
	it('calls revokeOtherSessions when the button is clicked', async () => {
		const { getByRole, getByText } = render(SecuritySection);
		await fireEvent.click(getByRole('button', { name: /sign out of all other devices/i }));
		expect(revokeOtherSessions).toHaveBeenCalledOnce();
		expect(getByText(/signed out other devices/i)).toBeTruthy();
	});
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `bun run test:unit -- --run src/routes/profile/SecuritySection.svelte.test.ts`
Expected: FAIL — cannot resolve `./SecuritySection.svelte`.

- [ ] **Step 7: Implement SecuritySection**

`src/routes/profile/SecuritySection.svelte`:

```svelte
<script lang="ts">
	import { authClient } from '$lib/auth-client';

	let busy = $state(false);
	let done = $state(false);
	let error = $state<string | null>(null);

	async function signOutOthers() {
		error = null;
		done = false;
		busy = true;
		const result = await authClient.revokeOtherSessions();
		busy = false;
		if (result.error) {
			error = result.error.message ?? 'Could not sign out other devices.';
			return;
		}
		done = true;
	}
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<h2 class="mb-2 text-lg font-semibold text-slate-900">Security</h2>
	<p class="mb-4 text-sm text-slate-600">
		Signs out every other browser and device. Your current session stays active.
	</p>
	{#if error}<p class="mb-2 text-sm text-red-700">{error}</p>{/if}
	{#if done}<p class="mb-2 text-sm text-green-700">Signed out other devices.</p>{/if}
	<button
		type="button"
		onclick={signOutOthers}
		disabled={busy}
		class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
	>
		{busy ? 'Signing out…' : 'Sign out of all other devices'}
	</button>
</section>
```

- [ ] **Step 8: Run both sections' tests**

Run: `bun run test:unit -- --run src/routes/profile/UsageSection.svelte.test.ts src/routes/profile/SecuritySection.svelte.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/routes/profile/UsageSection.svelte src/routes/profile/UsageSection.svelte.test.ts src/routes/profile/SecuritySection.svelte src/routes/profile/SecuritySection.svelte.test.ts
git commit -m "feat(profile): usage meter and sign-out-everywhere sections"
```

---

### Task 6: Compose the page + link it from the header

Assemble the four sections into `+page.svelte`, then make the header email link to `/profile` (desktop link + mobile menu item).

**Files:**
- Create: `src/routes/profile/+page.svelte`
- Modify: `src/lib/components/Header.svelte` (email → link; add mobile menu entry)

**Interfaces:**
- Consumes: `data` from Task 2's load; the four section components from Tasks 3–5; `resolve` (`$app/paths`).
- Produces: the finished route and navigation entry.

- [ ] **Step 1: Implement the page**

`src/routes/profile/+page.svelte`:

```svelte
<script lang="ts">
	import AccountSection from './AccountSection.svelte';
	import SubscriptionSection from './SubscriptionSection.svelte';
	import UsageSection from './UsageSection.svelte';
	import SecuritySection from './SecuritySection.svelte';

	let { data } = $props();
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
	<UsageSection used={data.usage.used} limit={data.usage.limit} resetAt={data.usage.resetAt} />
	<SecuritySection />
</div>
```

- [ ] **Step 2: Typecheck the page**

Run: `bun run check`
Expected: PASS — props line up with the load's return shape.

- [ ] **Step 3: Link the email in the desktop header**

In `src/lib/components/Header.svelte`, replace the desktop user `<span>` (the block starting `<span class="flex items-center gap-2 text-slate-500">` containing `{user.email}`) so the email is a link to the profile. New markup:

```svelte
<a
	href={resolve('/profile')}
	class="flex items-center gap-2 text-slate-500 transition hover:text-slate-900"
>
	{user.email}
	{#if plan === 'pro'}
		<span
			class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-blue-700 uppercase"
			>Pro</span
		>
	{/if}
</a>
```

- [ ] **Step 4: Add a Profile entry to the mobile menu**

In `src/lib/components/Header.svelte`, inside the mobile `{#if user}` block, immediately above the `<div class="mt-1 border-t border-slate-100 pt-2">` wrapper, add:

```svelte
<a
	href={resolve('/profile')}
	onclick={() => (menuOpen = false)}
	class="block rounded-lg px-2 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50"
	>Profile</a
>
```

- [ ] **Step 5: Full check + existing Header tests**

Run: `bun run check && bun run test:unit -- --run`
Expected: PASS across the suite (nothing else references the changed Header markup by shape).

- [ ] **Step 6: Manually verify the flow**

Run: `bun run dev`, then as a logged-in user visit `/profile`. Confirm: the four sections render; the header email links here; visiting `/profile` while logged out redirects to `/login`.

- [ ] **Step 7: Commit**

```bash
git add src/routes/profile/+page.svelte src/lib/components/Header.svelte
git commit -m "feat(profile): compose profile page and link from header"
```

---

### Task 7: End-to-end guard test

A Playwright test asserting the auth guard, matching the repo's existing e2e style.

**Files:**
- Create: `e2e/profile.spec.ts`

**Interfaces:**
- Consumes: `@playwright/test`. Check an existing spec in `e2e/` for the base URL / helper conventions before writing, and mirror them.

- [ ] **Step 1: Write the guard test**

`e2e/profile.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('anonymous visit to /profile redirects to login', async ({ page }) => {
	await page.goto('/profile');
	await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 2: Run it**

Run: `bun run test:e2e -- e2e/profile.spec.ts`
Expected: PASS (redirect to `/login`). If the e2e setup requires a running dev server / different invocation, follow the pattern in the existing `e2e/` specs and `playwright.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add e2e/profile.spec.ts
git commit -m "test(profile): e2e guard redirects anonymous users to login"
```

---

## Self-Review

**Spec coverage:**
- Route & guard → Task 2 (load redirect) + Task 7 (e2e).
- Shared usage-count helper → Task 1.
- Account section (name / email+verified / password / Google note) → Task 3, backed by `hasPassword` from Task 2.
- Subscription section (free/pro/root, renewal, manage/upgrade) → Task 4.
- Usage section → Task 5 + `usageView`/`resetAt` from Task 2.
- Security (sign out everywhere) → Task 5.
- Header link → Task 6.
- Testing (unit helpers + component states + e2e) → Tasks 1–5, 7.
- Out-of-scope items (editor prefs, deletion, avatar) → intentionally absent. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected outcomes. ✓

**Type consistency:** Load return shape in Task 2 (`name`, `email`, `emailVerified`, `plan`, `hasPassword`, `subscription.{status,currentPeriodEnd,manageUrl}`, `usage.{used,limit,resetAt}`) matches the props passed in Task 6 and consumed in Tasks 3–5. `windowWhere`/`countInWindow`/`EXPORT_ACTION` signatures in Task 1 match their imports in Task 2 and the gate. `usageView` returns `{ used, limit }` used by Task 2. ✓

## Notes for the implementer

- Confirm `authClient` exposes `updateUser`, `changePassword`, and `revokeOtherSessions` in this better-auth version (all are standard). If `changePassword` needs a `revokeOtherSessions: boolean` option in this version, pass `false` — the dedicated control in SecuritySection owns that action.
- `emailVerified` on `locals.user` is typed by better-auth's session; the `?? false` guard covers the optional case.
