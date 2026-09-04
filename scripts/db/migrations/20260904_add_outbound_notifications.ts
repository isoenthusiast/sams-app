import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-009 (Outbound Notifications, Phase 3a Feature B).
 *
 * Adds:
 *   1. `Company.notificationWebhookUrl TEXT?` — per-company incoming webhook URL
 *      (Slack-compatible `{"text": …}`). WRITE-ONLY secret: settable via the
 *      client-Admin portal settings card, masked in every API response, never in
 *      ActivityLog / digest posts, excluded from the client-data export (exact
 *      name in EXCLUSION_COLUMNS). Nullable — null = no outbound posts.
 *   2. `NotificationDeliveryChannel` enum (`webhook`) + `NotificationDeliveryStatus`
 *      enum (`sent | failed`).
 *   3. `NotificationDelivery` table: notificationId? (FK → Notification, nullable
 *      for company-channel/sweep/digest posts), channel, companyId (FK → Company),
 *      status, responseCode?, attemptedAt, payloadPreview? (≤200).
 *
 * ONLY ADDs — never drops or alters existing objects, safe against the shared
 * Postgres DB (no `prisma db push`). Idempotent: every statement guards with
 * duplicate_object / IF NOT EXISTS, so it can be run repeatedly (verified ×2).
 *
 * Deploy order: migration → generate → build → E2E. Per the executor authority
 * update, Cody (executor) applies this manually at landing
 * (`npx tsx scripts/db/migrations/20260904_add_outbound_notifications.ts`)
 * against the repo `.env` prod URL — never `prisma db push` — before the Railway
 * build runs `prisma generate && npm run build`. `CRON_SECRET` is added to the
 * Railway env at landing + the local `.env` (generated; documented — never
 * committed).
 */
async function main() {
  console.log("Adding Outbound Notifications schema (SAMS-009)…");

  // 1. Company.notificationWebhookUrl — additive, nullable, guarded.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "notificationWebhookUrl" TEXT;`);
  console.log("✓ Company.notificationWebhookUrl");

  // 2. Native enums. Postgres has no CREATE TYPE IF NOT EXISTS, so guard with an
  //    exception block (same pattern as SAMS-002/004/006 migrations).
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('webhook');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('sent', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("✓ NotificationDeliveryChannel / NotificationDeliveryStatus enums");

  // Add the SAMS-009 sweep event type to the existing NotificationType enum
  // (additive value; Postgres ADD VALUE IF NOT EXISTS is idempotent).
  await prisma.$executeRawUnsafe(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ActionOverdue';`);
  console.log("✓ NotificationType += ActionOverdue");

  // 3. NotificationDelivery table. Additive-only; FK inline on first run. `id` is
  //    a client-generated cuid (Prisma creates it, so no DB default). `channel`
  //    and `status` use the native enums; `notificationId` is nullable (FK →
  //    Notification, SetNull on delete); `companyId` required (FK → Company,
  //    Cascade — a hard-deleted company drops its delivery audit trail).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
      "id" TEXT NOT NULL,
      "notificationId" TEXT,
      "channel" "NotificationDeliveryChannel" NOT NULL DEFAULT 'webhook',
      "companyId" TEXT NOT NULL,
      "status" "NotificationDeliveryStatus" NOT NULL,
      "responseCode" INTEGER,
      "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "payloadPreview" TEXT,
      CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "NotificationDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  console.log("✓ NotificationDelivery table");

  // Indexes (IF NOT EXISTS).
  const indexes = [
    'CREATE INDEX IF NOT EXISTS "NotificationDelivery_companyId_idx" ON "NotificationDelivery"("companyId");',
    'CREATE INDEX IF NOT EXISTS "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");',
    'CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_attemptedAt_idx" ON "NotificationDelivery"("status", "attemptedAt");',
  ];
  for (const sql of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("✓ NotificationDelivery indexes");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
