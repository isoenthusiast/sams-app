import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-002 (Operator Console + provider role plane),
 * Phase 0 of the managed GRA SaaS roadmap.
 *
 * ONLY ADDs — never drops or alters existing objects, so it is safe against the
 * shared Postgres DB (no `prisma db push`). Idempotent: every statement guards
 * with IF NOT EXISTS / duplicate_object, so it can be run repeatedly.
 *
 * Deploy order (§6 of CONAN_OperatorConsole_Design.md): migration → generate →
 * build → E2E. Conan applies this manually (`npx tsx scripts/db/migrations/...`)
 * before the Railway build runs `prisma generate && npm run build`.
 *
 * Manages:
 *   1. `ProviderRole` enum (ProviderAdmin | ProviderConsultant).
 *   2. `User.providerRole` nullable column (orthogonal to the `Role` enum).
 *   3. `ActivityLogType` row `PROVIDER_CONTEXT_SWITCH` (audit-trail reference).
 */
async function main() {
  console.log("Adding provider role plane schema (SAMS-002)…");

  // 1. Native enum type. Postgres has no CREATE TYPE IF NOT EXISTS, so guard
  //    with an exception block (same pattern as scripts/add_transcript_tagging.ts).
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ProviderRole" AS ENUM ('ProviderAdmin', 'ProviderConsultant');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("✓ ProviderRole enum");

  // 2. Nullable column on User. Additive, no default, no backfill.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "providerRole" "ProviderRole"`
  );
  console.log("✓ User.providerRole column");

  // 3. Reference row for the context-switch audit type. Idempotent upsert.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ActivityLogType" ("id", "activityType", "description", "createdAt")
     VALUES ($1, 'PROVIDER_CONTEXT_SWITCH', 'Provider staff switched the selected company context', NOW())
     ON CONFLICT ("activityType") DO NOTHING`,
    `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  console.log("✓ ActivityLogType PROVIDER_CONTEXT_SWITCH row");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
