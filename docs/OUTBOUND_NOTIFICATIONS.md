# Outbound Notifications (SAMS-009, Phase 3a Feature B) — Runbook

## What it does

Pushes in-app fabric events (EvidenceRequested / Submitted / Reviewed, CommentShared)
plus an Action-overdue sweep and a weekly digest out to a **per-company incoming
webhook** (Slack-compatible `{"text": …}` — works on Slack and Teams legacy
connectors). The webhook URL is a **write-only secret** on `Company.notificationWebhookUrl`:
set/clear it via the client-Admin portal settings card, never read it back, and it
is excluded from every export, API response, ActivityLog row, and digest post.

## Env vars

| Var | Where | Purpose |
|-----|-------|---------|
| `CRON_SECRET` | **Railway env (required at landing)** + **local `.env`** | Bearer token gating `POST /api/cron/notify-sweep` and `POST /api/cron/weekly-digest`. **New** — generated, stored in Railway + local `.env` only, **never committed**. |
| `DATABASE_URL` | Railway + local `/ .env` | Existing Postgres connection. |

`CRON_SECRET` is **fail-closed**: if it is unset, both cron routes return **503**
(they never run unauthenticated). A request without a matching
`Authorization: Bearer <CRON_SECRET>` returns **401**.

The cron routes are exempted from the NextAuth proxy matcher (`src/proxy.ts`), so
they are reachable **server-to-server without a session cookie** — that is the whole
point: an external scheduler authenticates with the bearer token, not a user login.

## Schema (additive, idempotent — no `prisma db push`)

`scripts/db/migrations/20260904_add_outbound_notifications.ts`:

- `Company.notificationWebhookUrl TEXT?` — write-only secret, nullable.
- `NotificationDelivery` — fire-and-record audit table (`notificationId?`, `channel`,
  `companyId`, `status sent|failed`, `responseCode?`, `attemptedAt`, `payloadPreview ≤200`).
- `NotificationType += ActionOverdue` — the sweep event (in-app to client Admins).

Apply at landing: `npx tsx scripts/db/migrations/20260904_add_outbound_notifications.ts`
against the prod `DATABASE_URL` **before** the Railway build runs
`prisma generate && npm run build`. Run it once now and once more to prove idempotency.

## Cron trigger

Pilot trigger = the **Hermes box cron** (existing infra, zero new accounts). Alternative
= **Railway cron** (documented here as the production option):

```
# Notify sweep — run daily (e.g. 08:00 UTC)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/notify-sweep
# Weekly digest — run weekly (e.g. Monday 08:00 UTC)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/weekly-digest
```

- `notify-sweep`: finds Actions that crossed their `targetDate` in the last **24h**
  (still open). Per affected company: ONE company-channel webhook card + an in-app
  `ActionOverdue` notification to the company's client Admins.
- `weekly-digest`: for every company WITH a webhook, ONE card with SOC coverage %
  (fully-comply / assessed, `#51`), new findings this week, overdue actions, open
  evidence requests.

## Client-Admin settings

- `/portal/settings` (client Admin only) — set / clear / send-test the company's
  **write-only** webhook URL. The URL is never displayed (password field, cleared
  after save; the API returns only `{ configured }`).
- API: `GET|POST /api/portal/notifications-settings` and
  `POST /api/portal/notifications-settings/test` (role=Admin + company membership).

## Tests

```
npx tsx scripts/db/migrations/20260904_add_outbound_notifications.ts   # x2 (idempotent)
npm run db:parity && npm run build && npm run test:isolation
npx tsx scripts/notifications/seed_outbound.ts                         # seed throwaway DB
# then, with a built server on :3200 + CRON_SECRET set:
npx tsx scripts/notifications/outbound_functional_test.ts              # (a)-(f)
node scripts/notifications/outbound_ui_test.mjs                        # (g)
```
