import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-010 (White-label theming, Phase 3b). Feature A.
 *
 * Adds TWO nullable columns to `Company`:
 *   1. `logoUrl` TEXT — portal header logo URL (must be https; validated at the
 *      API layer, not here).
 *   2. `primaryColor` TEXT — portal accent colour, validated `^#[0-9a-fA-F]{6}$`
 *      at the API layer (stored as text; the regex is a schema contract enforced
 *      by the write route, since Prisma `String?` cannot express the pattern).
 *
 * The columns drive portal-only theming (settled decision #2): the portal header
 * renders the logo (with text fallback on load failure) and sets a `--brand` CSS
 * variable. The operator app stays SAMS-branded.
 *
 * ONLY ADDs — never drops or alters existing objects, so it is safe against the
 * shared Postgres DB (no `prisma db push`). Idempotent: every statement guards
 * with IF NOT EXISTS, so it can be run repeatedly (verified x2).
 *
 * Deploy order (§deploy): migration → generate → build → E2E. Per the executor
 * authority update, Cody (executor) applies this manually at landing
 * (`npx tsx scripts/db/migrations/20260904_add_company_theme.ts`) against the
 * repo `.env` prod URL — never `prisma db push`.
 */
async function main() {
  console.log("Adding Company white-label theme columns (SAMS-010)…");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT`
  );
  console.log("✓ Company.logoUrl column");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT`
  );
  console.log("✓ Company.primaryColor column");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
