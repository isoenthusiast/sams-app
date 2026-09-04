import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-012 (SSO Entra ID + force-password-change, Phase 3b).
 * Feature C.
 *
 * Adds ONE column to `User`:
 *   `mustChangePassword` BOOLEAN NOT NULL DEFAULT false — wizard-provisioned users
 *   (SAMS-008 temp passwords) get this set at provisioning time; a credentials login
 *   with the flag is redirected to `/change-password` until the flag is cleared
 *   (settled decision #4). SSO users authenticate via their corporate IdP and are
 *   NOT forced through the change flow (C4 describes credentials only).
 *
 * ONLY ADDs — never drops or alters existing objects, so it is safe against the
 * shared Postgres DB (no `prisma db push`). Idempotent: ALTER ... ADD COLUMN IF NOT
 * EXISTS, so it can be run repeatedly (verified x2).
 *
 * Deploy order (§deploy): migration → generate → build → E2E. The executor applies
 * it manually at landing (`npx tsx scripts/db/migrations/20260904_add_user_must_change_password.ts`)
 * against the prod `DATABASE_URL` — never `prisma db push`. (Dev/CI can `db push`
 * the schema which already declares the column; this script exists for prod sync.)
 */
async function main() {
  console.log("Adding User.mustChangePassword column (SAMS-012)…");

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`
  );
  console.log("✓ User.mustChangePassword column");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
