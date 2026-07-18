# Profile page for logged-in users — design

**Date:** 2026-07-18
**Branch context:** builds on existing better-auth + Lemon Squeezy + Drizzle setup.

## Goal

Give logged-in users a single `/profile` page to manage their account, view and
manage their subscription, see usage, and secure their sessions. Anonymous
visitors are redirected to `/login`.

## Scope decisions (agreed)

- **Include:** Account (display name, password), Subscription & billing, Usage
  stats, Security (sign out everywhere).
- **Exclude:** avatar/`image` (never collected or shown in the product),
  editor preferences (deferred to a next milestone — no storage exists today),
  account deletion (only "sign out everywhere" for the danger zone).

## User-data audit (what actually exists / is used)

- `user.name` — collected as a required field at signup (`signUp.email`), but not
  shown anywhere in the product (the header shows `email`). It is real data, so an
  **editable display name** is legitimate. **Keep.**
- `user.image` — never collected, never rendered in the product UI. **Skip.**
- `user.emailVerified` — used only in `/admin` today. Cheap to surface as a
  **read-only "Verified" badge** next to the email. **Include (read-only).**
- `account.providerId` — distinguishes an email/password signup (a password exists)
  from a Google signup (no password). Drives whether the **change-password** control
  is shown.

## Route & data loading

`src/routes/profile/+page.server.ts` — `load`:

1. If `!locals.user`, `redirect(302, '/login')`.
2. Resolve `plan` via `resolvePlan(user.id)`.
3. Fetch the `subscription` row for `status`, `currentPeriodEnd`, `manageUrl`
   (null when free/root — root has no LS subscription).
4. Compute usage: `used` (count in the current window), `limit` (from `CAPS`),
   `resetAt` (when the oldest in-window event ages out, or null if under cap /
   unlimited). Uses the shared helper below.
5. Derive `hasPassword`: true when an `account` row for this user has a non-null
   `password` (i.e. a `providerId` credential account). Determines whether the
   change-password control renders.

Returns: `{ plan, subscription: { status, currentPeriodEnd, manageUrl },
usage: { used, limit, resetAt }, hasPassword, email, name, emailVerified }`.

## Shared usage-count helper (targeted cleanup)

The SQL window-matching (`windowWhere`) and `countInWindow` currently live inside
`src/routes/editor/gate.remote.ts`. Extract them into
`src/lib/server/usage-count.ts` so the profile load and the export gate share one
source of truth and cannot drift:

- `windowWhere(userId, ipHash, since)` — the SQL predicate (moved verbatim).
- `countInWindow(userId, ipHash, now)` — count of the actor's in-window export events.

`gate.remote.ts` imports from the new module instead of defining them locally. Its
`nextExportAllowedAt` stays where it is (gate-specific) but reuses `windowWhere`.
No behaviour change — pure relocation.

For the profile page the actor is always the logged-in `userId` (no anonymous
`ipHash` branch needed for the display).

## Sections (component per concern)

All under `src/routes/profile/`, keeping each file focused (matches the codebase's
component-per-concern style):

### 1. `AccountSection.svelte`
- **Display name** — text input, save via `authClient.updateUser({ name })`.
  Inline error + pending state, `invalidateAll()` on success.
- **Email** — read-only, with a "Verified" badge when `emailVerified`.
- **Change password** — shown only when `hasPassword`. Current + new password
  fields, `authClient.changePassword({ currentPassword, newPassword })`. Google-only
  accounts see a "Signed in with Google" note instead.

### 2. `SubscriptionSection.svelte`
- **Plan badge** — free / pro / root.
- **Free** → renewal N/A; primary "Upgrade" CTA linking to `/pricing`.
- **Pro** → `currentPeriodEnd` renewal date, `status`, and a "Manage subscription"
  button opening `manageUrl` (Lemon Squeezy portal) in a new tab.
- **Root** → label only; no billing controls.

### 3. `UsageSection.svelte`
- "X / 5 exports used this hour" with the reset time when capped.
- Pro / root → "Unlimited".

### 4. `SecuritySection.svelte`
- "Sign out of all other devices" — `authClient.revokeOtherSessions()`, with a
  confirmation/pending state and a success indicator.

### `+page.svelte`
Composes the four sections, passing loaded data down as props.

## Mutations

All mutations run client-side through `authClient` (same pattern as the existing
login/signup pages) rather than form actions — simpler and consistent:
`updateUser`, `changePassword`, `revokeOtherSessions`. Each control manages its
own pending/error state, shows inline feedback, and calls `invalidateAll()` on
success so the loaded data refreshes.

## Header change

Make the header email a link to `/profile` on desktop, and add a "Profile" entry
to the mobile menu. Sign-out stays where it is.

## Error handling

- Mutation failures surface as inline text next to the relevant control; buttons
  disable while pending.
- `manageUrl` opens in a new tab (`target="_blank" rel="noopener"`).
- The load redirects unauthenticated users rather than rendering an empty page.

## Testing

- **Unit:** the extracted `usage-count` helper (window predicate / count), and the
  plan→limit mapping / `resetAt` derivation used by the load.
- **Component:** each section's state variants — free vs pro vs root; has-password
  vs Google-only; capped vs under-cap usage.
- Follows the existing vitest + `@testing-library/svelte` setup.

## Out of scope / next milestone

- Editor preferences (needs a per-user store — decide localStorage vs DB table
  later).
- Account deletion.
- Avatar upload.
