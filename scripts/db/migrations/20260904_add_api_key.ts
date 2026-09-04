import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-011 (Public Read-Only API), Phase 3b Feature B of
 * the managed GRA SaaS roadmap. Adds the `ApiKey` table — company-scoped bearer
 * keys for the three public v1 read-only endpoints.
 *
 * Adds:
 *   1. `ApiKey` table: id (cuid PK), companyId (FK → Company, ON DELETE CASCADE),
 *      keyHash (bcrypt — plaintext shown ONCE at creation, never stored), label
 *      (≤100, validated at the route layer), createdAt, createdByUserId (FK →
 *      User, ON DELETE SET NULL), lastUsedAt?, revokedAt?.
 *   2. Index on (companyId) — the scope key for every public v1 lookup.
 *
 * ONLY ADDs — never drops or alters existing objects, safe against the shared
 * Postgres DB (no `prisma db push`). Idempotent: the CREATE TABLE and indexes
 * guard with IF NOT EXISTS so it can be run repeatedly (verified x2).
 *
 * `ApiKey` is deliberately EXCLUDED from the client-data export (Data Trust Gate)
 * — see src/lib/data-trust-export.ts EXPORT_TABLES (the table is not catalgoued
 * there), so keys never travel with client data.
 *
 * Deploy order (§deploy): migration → generate → build → E2E. Per the executor
 * authority update, Cody (executor) applies this manually at landing
 * (`npx tsx scripts/db/migrations/20260904_add_api_key.ts`) against the repo
 * `.env` prod URL — never `prisma db push` — before the Railway build runs
 * `prisma generate && npm run build`.
 */
async function main() {
  console.log("Adding ApiKey schema (SAMS-011)…");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ApiKey" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "keyHash" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdByUserId" TEXT,
      "lastUsedAt" TIMESTAMP(3),
      "revokedAt" TIMESTAMP(3),
      CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  console.log("✓ ApiKey table");

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "ApiKey_companyId_idx" ON "ApiKey"("companyId");'
  );
  console.log("✓ ApiKey companyId index");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
