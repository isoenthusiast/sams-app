import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-014 (MIC Ritual, Phase 4 Feature B).
 *
 * Adds:
 *   1. `Company.attestationCadenceDays INTEGER?` — per-company attestation cadence
 *      in days. Nullable + additive; null = quarterly default (90) at read time.
 *      NOTE: next-due / due-soon / overdue are DERIVED (no stored flags) — this
 *      column is the only knob, never a status flag.
 *   2. `MicAttestation` table — the first-class attestation record pinning a PA's
 *      SOC posture at a point in time. `socSnapshot` is Json (SERVER-COMPUTED at
 *      signing), `companyId` FK→Company ON DELETE CASCADE, `processAreaId`
 *      FK→ProcessArea ON DELETE CASCADE, `attestedByUserId` FK→User ON DELETE SET
 *      NULL (a signed record survives the signer's removal), `period String?`,
 *      `attestedAt` default now(). Indexes on companyId / processAreaId / attestedAt.
 *   3. `NotificationType += MicAttestationDue` — the SPO in-app "attestation due"
 *      event emitted during the weekly-digest sweep (SAMS-009 rail), deduped per
 *      cadence window.
 *
 * ONLY ADDs — never drops or alters existing objects, safe against the shared
 * Postgres DB (no `prisma db push`). Idempotent: every statement guards with
 * duplicate_object / IF NOT EXISTS / ADD VALUE IF NOT EXISTS, so it can be run
 * repeatedly (verified ×2).
 *
 * Deploy order (§deploy): migration → generate → build → E2E. Per the executor
 * authority update, Cody (executor) applies this manually at landing
 * (`npx tsx scripts/db/migrations/20260904_add_mic_attestation.ts`) against the
 * repo `.env` prod URL — never `prisma db push` — before the Railway build runs
 * `prisma generate && npm run build`.
 */
async function main() {
  console.log("Adding MIC Ritual schema (SAMS-014)…");

  // 1. Company.attestationCadenceDays — additive, nullable, guarded.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "attestationCadenceDays" INTEGER;`);
  console.log("✓ Company.attestationCadenceDays");

  // 2. MicAttestation table. Additive-only; FKs inline on first run. `id` is a
  //    client-generated cuid (Prisma creates it, so no DB default). `socSnapshot`
  //    is JSONB (server-computed). companyId required (FK → Company, Cascade);
  //    processAreaId required (FK → ProcessArea, Cascade — a dead PA drops its
  //    attestations); attestedByUserId optional (FK → User, SetNull).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MicAttestation" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "processAreaId" TEXT NOT NULL,
      "period" TEXT,
      "attestedByUserId" TEXT,
      "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "socSnapshot" JSONB NOT NULL,
      CONSTRAINT "MicAttestation_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "MicAttestation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "MicAttestation_processAreaId_fkey" FOREIGN KEY ("processAreaId") REFERENCES "ProcessArea"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "MicAttestation_attestedByUserId_fkey" FOREIGN KEY ("attestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  console.log("✓ MicAttestation table");

  // Indexes (IF NOT EXISTS).
  const indexes = [
    'CREATE INDEX IF NOT EXISTS "MicAttestation_companyId_idx" ON "MicAttestation"("companyId");',
    'CREATE INDEX IF NOT EXISTS "MicAttestation_processAreaId_idx" ON "MicAttestation"("processAreaId");',
    'CREATE INDEX IF NOT EXISTS "MicAttestation_attestedAt_idx" ON "MicAttestation"("attestedAt");',
  ];
  for (const sql of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("✓ MicAttestation indexes");

  // 3. Add the MIC-due event to the existing NotificationType enum (additive value;
  //    ADD VALUE IF NOT EXISTS is idempotent; cannot run inside a transaction block,
  //    but $executeRawUnsafe autocommits so it is safe).
  await prisma.$executeRawUnsafe(`ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MicAttestationDue';`);
  console.log("✓ NotificationType += MicAttestationDue");

  // 4. ActivityLogType reference rows (audit trail; SAMS-002/004/005 convention).
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ActivityLogType" ("id", "activityType", "description", "createdAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("activityType") DO NOTHING`,
    `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    "MIC_ATTEST",
    "SOC attestation signed for a process area (MIC Ritual)"
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ActivityLogType" ("id", "activityType", "description", "createdAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("activityType") DO NOTHING`,
    `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    "MIC_CADENCE_CHANGE",
    "Company MIC attestation cadence changed (settled decision: per-company knob)"
  );
  console.log("✓ ActivityLogType MIC_ATTEST / MIC_CADENCE_CHANGE rows");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
