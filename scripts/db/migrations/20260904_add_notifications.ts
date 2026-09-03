import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-006 (In-App Notifications), Phase 2c of the
 * managed GRA SaaS roadmap. Feature B only (in-app center v1 — no SMTP/webhook,
 * no scheduler; overdue actions are computed at read-time, never stored).
 *
 * Adds:
 *   1. `NotificationType` enum (EvidenceRequested | EvidenceSubmitted |
 *      EvidenceReviewed | CommentShared).
 *   2. `Notification` table: recipientUserId (FK → User, indexed), type,
 *      entityType/entityId (polymorphic target, mirrors Comment), title (≤200),
 *      body (≤500), readAt?, companyId, createdAt. Index (recipientUserId,
 *      readAt) for the bell-count query; (companyId) for the overdue banner.
 *
 * ONLY ADDs — never drops or alters existing objects, safe against the shared
 * Postgres DB (no `prisma db push`). Idempotent: every statement guards with
 * duplicate_object / IF NOT EXISTS / IF NOT EXISTS on indexes, so it can be run
 * repeatedly (verified x2).
 *
 * Deploy order (§deploy): migration → generate → build → E2E. Conan applies
 * this manually (`npx tsx scripts/db/migrations/20260904_add_notifications.ts`)
 * before the Railway build runs `prisma generate && npm run build`.
 */
async function main() {
  console.log("Adding In-App Notifications schema (SAMS-006)…");

  // 1. Native enum. Postgres has no CREATE TYPE IF NOT EXISTS, so guard with an
  //     exception block (same pattern as SAMS-002/004 migrations).
  const enumValues = "'EvidenceRequested', 'EvidenceSubmitted', 'EvidenceReviewed', 'CommentShared'";
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "NotificationType" AS ENUM (${enumValues});
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("✓ NotificationType enum");

  // 2. Notification table. Additive-only; FK inline on first run. `id` is a
  //     client-generated cuid (Prisma creates it, so no DB default).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Notification" (
      "id" TEXT NOT NULL,
      "recipientUserId" TEXT NOT NULL,
      "type" "NotificationType" NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "readAt" TIMESTAMP(3),
      "companyId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  console.log("✓ Notification table");

  // Indexes (IF NOT EXISTS).
  const indexes = [
    ['CREATE INDEX IF NOT EXISTS "Notification_recipientUserId_readAt_idx" ON "Notification"("recipientUserId", "readAt");'],
    ['CREATE INDEX IF NOT EXISTS "Notification_companyId_idx" ON "Notification"("companyId");'],
  ];
  for (const [sql] of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("✓ Notification indexes");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
