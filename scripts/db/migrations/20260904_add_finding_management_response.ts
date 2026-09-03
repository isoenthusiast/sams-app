import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-005 (Client Portal) — Finding Management
 * Response fields (Phase 2b, Feature A).
 *
 * Adds three nullable, additive columns to `Finding`:
 *   - `managementResponse`     (TEXT, ≤2000 chars client-side) — the client's
 *                               named, attributable response to a finding.
 *   - `managementResponseAt`   (TIMESTAMP(3)) — when the response was saved.
 *   - `managementResponseById` (TEXT, FK → User) — who responded.
 *
 * ONLY ADDs — never drops or alters existing objects, so it is safe against the
 * shared Postgres DB (no `prisma db push`). Idempotent: every statement guards
 * with IF NOT EXISTS / a pg_constraint check / ON CONFLICT, so it can be run
 * repeatedly against dev AND prod (Conan applies the prod migration at landing).
 *
 * Deploy order (spec §Deploy): migration → prisma generate → build → E2E.
 */
async function main() {
  console.log("Adding Finding Management Response schema (SAMS-005)…");

  // 1. Columns (additive, IF NOT EXISTS — safe to re-run).
  const cols = [
    ['ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "managementResponse" TEXT;'],
    ['ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "managementResponseAt" TIMESTAMP(3);'],
    ['ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "managementResponseById" TEXT;'],
  ];
  for (const [sql] of cols) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("✓ managementResponse / managementResponseAt / managementResponseById columns");

  // 2. FK → User (guarded; Postgres has no ALTER TABLE ... ADD CONSTRAINT IF
  //    NOT EXISTS). Matches the Prisma field name so `db push` stays in sync.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Finding_managementResponseById_fkey') THEN
        ALTER TABLE "Finding"
          ADD CONSTRAINT "Finding_managementResponseById_fkey"
          FOREIGN KEY ("managementResponseById") REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("✓ Finding_managementResponseById_fkey constraint");

  // 3. Index (IF NOT EXISTS).
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Finding_managementResponseById_idx" ON "Finding"("managementResponseById");');
  console.log("✓ Finding_managementResponseById_idx index");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
