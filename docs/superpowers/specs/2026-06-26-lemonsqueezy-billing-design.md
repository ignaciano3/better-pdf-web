# Lemon Squeezy Pro billing — design

**Date:** 2026-06-26
**Status:** Approved design, pending spec review
**Branch:** `worktree-feat+lemonsqueezy-billing`

## Context

`better-pdf-web` is a freemium SvelteKit app. Pro-only ("heavy") operations are
gated server-side: `resolvePlan(userId)` reads the `subscription` table, and
`assertPro(plan)` throws HTTP 402 (`{ reason: 'pro_required', upgradeUrl:
'/pricing' }`) for any non-pro plan. Today there is **no billing integration** —
the `subscription` table is never written (the "#12 stub"), so everyone is on
`free`. The pricing page advertises Pro (monthly $6 / annual $48) and a Day pass
($3/24h) with disabled "coming soon" buttons.

The operator is based in Argentina, which Stripe does not support. We use
**Lemon Squeezy** (merchant-of-record) so no US company is required, VAT/sales
tax is handled by LS, and payouts can reach Argentina via Wise/PayPal.

## Goal

Wire real Pro billing through Lemon Squeezy so that paying users get the `pro`
plan and existing gating unlocks automatically. **Day pass is out of scope** for
this iteration.

## Scope decisions (locked)

1. **Products:** Pro subscription only (monthly + annual). Day pass deferred.
2. **Checkout linkage:** Server creates the checkout via the LS API, embedding
   `user_id` as custom data and prefilling the user's email. The webhook returns
   `user_id`, giving an exact subscription write (no email-matching).
3. **Self-serve management:** Yes. Store the LS customer-portal URL and surface a
   "Manage billing" link for Pro users.

## Architecture

Lemon Squeezy is the seller of record. The app does exactly two things:

1. **Create checkouts** server-side, with the user's id embedded.
2. **Process webhooks** to write the `subscription` row.

All existing gating (`resolvePlan` → `assertPro` → 402 → `/pricing`) is
unchanged.

```
User clicks "Upgrade"
  → POST /api/billing/checkout (authed)
      → LS API creates checkout w/ custom_data.user_id + prefilled email
      → returns checkout URL → redirect user to LS hosted page
User pays on LS
  → LS POSTs webhook → POST /api/billing/webhook
      → verify HMAC signature (timing-safe)
      → upsert subscription row (userId, plan, status, currentPeriodEnd,
        providerId, manageUrl)
Next request
  → resolvePlan() reads row → Pro unlocked
```

## Schema change

One new column on the existing `subscription` table:

| Column | Type | Meaning |
| --- | --- | --- |
| `manageUrl` | `text` (nullable) | LS customer-portal URL for self-serve cancel / card update |

Existing columns are reused:
- `providerId` now holds the **LS subscription id** (for reconciliation/debug).
- `currentPeriodEnd` holds the paid-through date (`renews_at` or, after cancel,
  `ends_at`).

`resolvePlan()` requires **no change** — see lifecycle mapping below.

Migration via `drizzle-kit generate` + `migrate`.

## Webhook → row mapping

LS sends subscription lifecycle events. The mapper normalizes them so that the
existing `resolvePlan()` logic (grants pro only when `status='active'` AND
`currentPeriodEnd` is in the future) keeps working untouched.

| LS event / status | Row written |
| --- | --- |
| `subscription_created` / `subscription_updated`, status `active` or `on_trial` | `plan='pro', status='active', currentPeriodEnd=renews_at, providerId, manageUrl` |
| `subscription_cancelled` (cancelled but paid through period) | keep `plan='pro', status='active'`, set `currentPeriodEnd=ends_at` |
| `subscription_expired`, or terminal `unpaid` / `past_due` exhausted | `status='inactive'` (drops to free) |

**Why cancellation needs no special logic:** on cancel we leave the user
`plan='pro', status='active'` but set `currentPeriodEnd` to the paid-through
date. `resolvePlan()` already returns `free` once `currentPeriodEnd < now`, so
access lasts exactly as long as paid, then auto-expires.

**Idempotency:** the webhook upsert is keyed on `userId` (primary key) and is
safe to replay. LS may redeliver; handlers must be idempotent and return 200
quickly.

## Components

### `src/lib/server/billing/lemonsqueezy.ts` (new, isolated, unit-tested)
- `createCheckout({ userId, email, variantId }) → Promise<{ url }>` — builds the
  LS checkout payload (store id, variant, `checkout_data.custom.user_id`,
  prefilled email), calls the LS API, returns the hosted checkout URL.
- `verifyWebhook(rawBody, signature) → boolean` — timing-safe HMAC-SHA256 over
  the raw request body using `LEMONSQUEEZY_WEBHOOK_SECRET`.
- `mapEventToRow(event) → SubscriptionRow | null` — pure function mapping a
  parsed LS webhook payload to the row to upsert (or `null` to ignore). No I/O,
  fully unit-testable from JSON fixtures.

### `POST /api/billing/checkout` (new route)
- Requires an authenticated session (reuse existing auth/session helpers).
- Reads desired cadence (`monthly` | `annual`) from the request, selects the
  matching variant id from env.
- Calls `createCheckout`, returns `{ url }` for the client to redirect to.

### `POST /api/billing/webhook` (new route)
- Reads the **raw** body, verifies the `X-Signature` header via `verifyWebhook`.
  Invalid signature → 401, no DB write.
- Parses the event, runs `mapEventToRow`, upserts the `subscription` row.
- Returns 200 fast (do minimal work synchronously).

### Pricing page (`src/routes/pricing/+page.svelte`)
- Replace the disabled "Billing coming soon" Pro button with a real Upgrade
  button that POSTs to `/api/billing/checkout` with the selected cadence (from
  the existing monthly/annual toggle) and redirects to the returned URL.
- Logged-out users keep the existing "Get started" → `/signup` path.

### "Manage billing" link
- Surface the user's `manageUrl` via layout data when present; render a "Manage
  billing" link (header or pricing page) so Pro users self-cancel / update card.

## Configuration (env vars)

| Var | Purpose |
| --- | --- |
| `LEMONSQUEEZY_API_KEY` | Server-side LS API auth (checkout creation) |
| `LEMONSQUEEZY_STORE_ID` | LS store id |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | HMAC secret for webhook verification |
| `LEMONSQUEEZY_VARIANT_PRO_MONTHLY` | Variant id for the monthly Pro plan |
| `LEMONSQUEEZY_VARIANT_PRO_ANNUAL` | Variant id for the annual Pro plan |

LS test mode (test API key + test cards) is used to validate the full loop
before switching to live keys.

## Testing

**Unit (no network — canned LS JSON fixtures):**
- `verifyWebhook`: valid signature passes; tampered body fails; wrong/missing
  signature fails.
- `mapEventToRow`: one case per lifecycle row in the mapping table above,
  including the cancel-keeps-access case and the expired/unpaid drop.
- `createCheckout`: payload builder includes store id, variant id,
  `custom.user_id`, and prefilled email (LS API call mocked).

**Manual (LS test mode, end-to-end):**
checkout → webhook → Pro unlocked → cancel → access persists until
`currentPeriodEnd` → expiry drops to free.

**Prerequisite for local webhook testing:** expose localhost to LS via a tunnel
(ngrok / cloudflared) so the LS dashboard can reach `POST /api/billing/webhook`.

## Out of scope (deferred)

- Day pass (one-off `order_created` + time-boxed entitlement).
- Proration UI, dunning emails, multiple seats.
