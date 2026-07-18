# Profile Anonymous Usage — Design Spec

**Goal:** Make the `/profile` Usage section show the count the export gate actually
enforces — the logged-in user's own in-window exports **plus** anonymous exports
made from the same browser (same IP + fingerprint) — as a single combined
number.

## Background

Anonymous export events are keyed by `ipHash = sha256(clientIP | fingerprint)`,
where the fingerprint is a per-browser id stored in `localStorage` under
`bpw:fingerprint` and sent to the server only with export requests
(`src/lib/server/identity.ts`, `src/routes/editor/gate.remote.ts`).

The export gate counts `own userId events OR anonymous events by ipHash`
(`countInWindow(userId, ipHash, …)`). The profile's SSR load currently counts
`own userId events only` (`countInWindow(userId, undefined, …)`) because a
server load has no access to the browser's fingerprint. So a user who exported
anonymously and then signed in from the same browser sees a profile number lower
than what the gate enforces.

## Decisions (from brainstorming)

- **Display:** one combined number (profile mirrors gate enforcement). No
  breakdown UI.
- **Mechanism:** a client-invoked remote `query` that receives the fingerprint
  from `localStorage`. SSR renders the own-only number instantly; the client
  refines it to the combined number once the fingerprint is available.

## Architecture

Three pieces plus client wiring.

### 1. Shared helper `usageForActor` (prevents load/query drift)

Extract the load's inline "count → usageView → resetAt" block into one function
so the SSR load and the new query cannot diverge (same rationale as the original
`usage-count` extraction).

- **Location:** `src/lib/server/usage-count.ts` (the impure DB-helper module that
  already owns `countInWindow`/`windowWhere`). `usageView` stays pure in
  `profile-usage.ts`.
- **Signature:**
  ```ts
  export async function usageForActor(
    userId: string | undefined,
    ipHash: string | undefined,
    plan: Plan,
    now: Date
  ): Promise<{ used: number; limit: number | null; resetAt: string | null }>
  ```
- **Body:** `used = await countInWindow(userId, ipHash, now)`; `view =
  usageView(plan, used)`; when `view.limit !== null && view.used >= view.limit`,
  derive `resetAt` from the oldest in-window event
  (`windowWhere(userId, ipHash, windowStart(now))`, order ascending, limit 1,
  `+ WINDOW_MS`, ISO string), else `null`. Returns the serialized view.
- Imports `Plan` from `$lib/server/plan`, `usageView` from
  `$lib/server/profile-usage`, `WINDOW_MS`/`windowStart` from
  `$lib/server/rate-limit`. No import cycle (`profile-usage` imports only
  `rate-limit`).

### 2. Load refactor (own-only, unchanged behavior)

`src/routes/profile/+page.server.ts` replaces its inline usage block with:
```ts
const usage = await usageForActor(userId, undefined, plan, now);
```
Return shape is unchanged (`usage: { used, limit, resetAt }`). This is a pure
refactor — SSR still shows own-only.

### 3. Remote query `getProfileUsage`

New file `src/routes/profile/usage.remote.ts`, mirroring `gate.remote.ts`
conventions (`query('unchecked', …)` from `$app/server`, `getRequestEvent()`):

```ts
export const getProfileUsage = query('unchecked', async (input: unknown) => {
  const fingerprint = (input as { fingerprint?: unknown } | null)?.fingerprint;
  if (typeof fingerprint !== 'string' || fingerprint.length === 0 || fingerprint.length > 256) {
    error(422, 'Invalid fingerprint');
  }
  const event = getRequestEvent();
  if (!event.locals.user) error(401, 'Not authenticated');
  const userId = event.locals.user.id;
  const identity = resolveIdentity(event, fingerprint);        // userId + ipHash
  const plan = await resolvePlan(userId);
  return usageForActor(identity.userId, identity.ipHash, plan, new Date());
});
```

The input is an object `{ fingerprint }` (mirrors the gate's payload shape) so
the wire contract is symmetric with `checkExportAllowance`. Returns the same
`{ used, limit, resetAt }` shape the load returns.

### 4. Client refinement in `+page.svelte`

```ts
import { getProfileUsage } from './usage.remote';

let { data } = $props();
let usage = $state(data.usage);          // SSR own-only, initial

$effect(() => {
  const fp = localStorage.getItem('bpw:fingerprint');   // READ-ONLY: never mint one here
  if (!fp) return;                        // no fingerprint => no anon events for this browser
  getProfileUsage({ fingerprint: fp })
    .then((refined) => { usage = refined; })
    .catch(() => { /* keep SSR own-only value */ });
});
```
`<UsageSection used={usage.used} limit={usage.limit} resetAt={usage.resetAt} />`.
`UsageSection.svelte` is unchanged.

**Why read-only fingerprint:** the editor's `getFingerprint()` mints and persists
a UUID when absent. The profile page must NOT do that — a freshly minted id
matches no stored events, and seeding an id from a page that never exports is a
pointless side effect. Absent key ⇒ there are no anon events ⇒ own-only is
already correct.

## Data Flow

SSR load → own-only `{used,limit,resetAt}` rendered immediately → `$effect`
reads `bpw:fingerprint` → if present, `getProfileUsage` returns the combined
count → `UsageSection` updates to the enforced number. If the key is absent or
the query fails, the own-only value stands.

## Error Handling

- Query validates the fingerprint (422 on bad input) and guards to logged-in
  (401 for anonymous callers — the query is only ever called from the guarded
  profile page, but it must not trust that).
- Client `.catch` swallows query failure and keeps the SSR value (usage display
  is non-critical; never block or error the page over it).

## Security

- The query never accepts a client-supplied userId; identity comes from
  `event.locals.user` + `resolveIdentity`. A caller can only ever influence the
  *anonymous* half by supplying a fingerprint, and that only ever counts events
  already keyed to `sha256(theirIP | fp)` — it cannot inflate or read another
  user's data.
- No document bytes involved; metadata only, consistent with the gate.

## Testing

- **`usageForActor`** (`usage-count.test.ts` or a new `usage-count` test block):
  assert the `windowWhere`/`countInWindow` inputs differ for own-only
  (`ipHash === undefined`) vs combined (real ipHash) using the same structural /
  `PgDialect().sqlToQuery(...).params` approach already used for `windowWhere`
  (no live DB). Confirms the combined path threads `ipHash` through and the
  own-only path does not embed an undefined param.
- **`getProfileUsage`** query: fingerprint validation (rejects empty / >256 /
  non-string with 422) and the auth guard (401 when `locals.user` is null),
  mirroring the existing gate tests' style (`getRequestEvent` mocked).
- **Load refactor:** covered by `bun run check` (return shape unchanged) and the
  existing `guard.test.ts`.
- Full unit suite + `bun run check` green; touched files prettier/eslint clean.

## Out of Scope

- No breakdown UI ("2 from before you signed in").
- No change to how the editor mints/sends the fingerprint.
- No change to `UsageSection.svelte`'s markup.
- No live-DB integration test for the combined count (the e2e/rate-limit spec
  already exercises the gate's own+anon counting end-to-end).
