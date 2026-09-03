import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-003 (Data Trust Gate, Phase 1 — signability):
 * company retention (archive → 30-day safety net → confirmed hard delete).
 *
 * ONLY ADDs — never drops or alters existing objects, so it is safe against the
 * shared Postgres DB (no `prisma db push`). Idempotent: every statement guards
 * with IF NOT EXISTS / duplicate_object / ON CONFLICT DO NOTHING, so it can be
 * run repeatedly.
 *
 * Deploy order (§6 of CONAN_DataTrustGate_Design.md): migration → generate →
 * build → E2E. Conan applies this manually (`npx tsx scripts/db/migrations/...`)
 * before the Railway build runs `prisma generate && npm run build`.
 *
 * Adds:
 *   1. `Company.archivedAt`  TIMESTAMPTZ nullable — set on offboarding.
 *   2. `Company.deletionScheduledAt` TIMESTAMPTZ nullable — safety-net countdown
 *      start (= deletionScheduledAt + 30 days for the expired-net check).
 *   3. ActivityLogType reference rows for the retention/export audit trail.
 */
async function main() {
  console.log("Adding company retention schema (SAMS-003)…");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ`
  );
  console.log("✓ Company.archivedAt column");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "deletionScheduledAt" TIMESTAMPTZ`
  );
  console.log("✓ Company.deletionScheduledAt column");

  // Reference rows for the retention/export audit trail. Idempotent upserts.
  const refTypes: Array<[string, string]> = [
    ["COMPANY_ARCHIVED", "Company offboarded (archived) — hidden from selectors, logins blocked"],
    ["COMPANY_SCHEDULE_DELETE", "Company archive advanced to pending hard delete (30-day safety net started)"],
    ["COMPANY_REINSTATE", "Company reinstated — archivedAt/deletionScheduledAt cleared, access restored"],
    ["COMPANY_EXPORT", "Client-data export package produced (per-company ZIP)"],
  ];
  for (const [activityType, description] of refTypes) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ActivityLogType" ("id", "activityType", "description", "createdAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("activityType") DO NOTHING`,
      `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      activityType,
      description
    );
    console.log(`✓ ActivityLogType ${activityType}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
