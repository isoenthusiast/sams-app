import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-016 (Master Content Roll-Forward, Phase 4
 * Feature D) — versioned content packs + provider-adopts-on-the-client's-behalf.
 *
 * Adds:
 *   1. `ContentStatus` enum (`Active | Superseded`) — read-only marker for
 *      removed-but-referenced content retained after an adoption.
 *   2. `contentStatus` + `supersededAt` columns on `Standard`, `ProcessArea`,
 *      `Requirement`, `Control` (additive, defaulted `Active`, nullable
 *      `supersededAt`). The adopt path sets `Superseded` for removed-but-
 *      referenced rows; FK links resolve unchanged and the row stays readable.
 *   3. `ContentPack` table (MASTER-PLANE): immutable, versioned snapshot of the
 *      SAMS001 content graph (`snapshot JSONB`). `companyId` FK → Company; a
 *      publish always creates a NEW row so prior versions stay queryable.
 *   4. `CompanyContentState` table (TENANT-scoped): one row per company tracking
 *      the adopted `contentVersion` + the portal-banner acknowledgment
 *      (`acknowledgedContentVersion`, null = not acknowledged).
 *   5. `NotificationType += ContentBaselineUpdated` (in-app client notice).
 *   6. `ActivityLogType` rows `CONTENT_PACK_PUBLISH` / `CONTENT_PACK_ADOPT`
 *      (audit-trail convention).
 *
 * ONLY ADDs — never drops or alters existing objects, safe against the shared
 * Postgres DB (no `prisma db push`). Idempotent: every statement guards with
 * duplicate_object / IF NOT EXISTS / ADD VALUE IF NOT EXISTS, so it can be run
 * repeatedly (verified ×2).
 *
 * Deploy order (§deploy): migration → generate → build → E2E. Per the executor
 * authority update, Cody (executor) applies this manually at landing
 * (`npx tsx scripts/db/migrations/20260904_add_content_pack.ts`) against the
 * repo `.env` prod URL — never `prisma db push` — before the Railway build runs
 * `prisma generate && npm run build`.
 */
async function main() {
  console.log("Adding Master Content Roll-Forward schema (SAMS-016)…");

  // 1. ContentStatus enum. Postgres has no CREATE TYPE IF NOT EXISTS, so guard.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ContentStatus" AS ENUM ('Active', 'Superseded');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("✓ ContentStatus enum");

  // 2. Additive content-status columns on the 4 content models.
  const addColumns: Array<[string, string]> = [
    ["Standard", "contentStatus"],
    ["ProcessArea", "contentStatus"],
    ["Requirement", "contentStatus"],
    ["Control", "contentStatus"],
  ];
  for (const [table, col] of addColumns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" "ContentStatus" NOT NULL DEFAULT 'Active';`);
  }
  console.log("✓ contentStatus columns (Standard/ProcessArea/Requirement/Control)");
  for (const [table] of addColumns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);`);
  }
  console.log("✓ supersededAt columns (Standard/ProcessArea/Requirement/Control)");

  // 3. ContentPack table (master plane). `snapshot` is JSONB (immutable graph).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ContentPack" (
      "id" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "companyId" TEXT NOT NULL,
      "snapshot" JSONB NOT NULL,
      "publishedById" TEXT,
      "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContentPack_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ContentPack_companyId_version_key" UNIQUE ("companyId", "version"),
      CONSTRAINT "ContentPack_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  console.log("✓ ContentPack table");
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ContentPack_companyId_publishedAt_idx" ON "ContentPack"("companyId", "publishedAt");`);
  console.log("✓ ContentPack index");

  // 4. CompanyContentState table (tenant-scoped; one row per company).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyContentState" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "contentVersion" INTEGER NOT NULL DEFAULT 1,
      "lastPackId" TEXT,
      "lastAdoptedAt" TIMESTAMP(3),
      "acknowledgedContentVersion" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CompanyContentState_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CompanyContentState_companyId_key" UNIQUE ("companyId"),
      CONSTRAINT "CompanyContentState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  console.log("✓ CompanyContentState table");
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CompanyContentState_companyId_idx" ON "CompanyContentState"("companyId");`);
  console.log("✓ CompanyContentState index");

  // 5. NotificationType += ContentBaselineUpdated (additive enum value; idempotent).
  await prisma.$executeRawUnsafe(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ContentBaselineUpdated';`);
  console.log("✓ NotificationType += ContentBaselineUpdated");

  // 6. ActivityLogType refs (audit-trail convention).
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ActivityLogType" ("id", "activityType", "description", "createdAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("activityType") DO NOTHING`,
    `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    "CONTENT_PACK_PUBLISH",
    "Master published a versioned content pack (SAMS-016)"
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ActivityLogType" ("id", "activityType", "description", "createdAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("activityType") DO NOTHING`,
    `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    "CONTENT_PACK_ADOPT",
    "Provider adopted a content pack on a client's behalf (SAMS-016)"
  );
  console.log("✓ ActivityLogType CONTENT_PACK_PUBLISH / CONTENT_PACK_ADOPT rows");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
