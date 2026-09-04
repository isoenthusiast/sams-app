import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-013 (Transcript → Evidence Chain), Phase 4
 * Feature A — the ExtractionProposal record.
 *
 * Adds the `ExtractionProposal` table + `ProposalStatus` enum + indexes, and
 * registers three ActivityLogType audit rows. The proposal record IS the
 * attestation trail: status Proposed/Confirmed/Rejected, source transcript +
 * span reference, target checklist item, proposedBy=AI, confirmedBy/rejectedBy
 * user + timestamps.
 *
 * ONLY ADDs — never drops or alters existing objects, so it is safe against the
 * shared Postgres DB (no `prisma db push`). Idempotent: every statement guards
 * with IF NOT EXISTS / duplicate_object / ON CONFLICT, so it can be run
 * repeatedly against dev AND prod (Conan applies the prod migration at landing).
 *
 * Deploy order (spec §Deploy): migration → prisma generate → build → E2E.
 */
async function main() {
  console.log("Adding ExtractionProposal schema (SAMS-013)…");

  // 1. ProposalStatus enum (Postgres has no CREATE TYPE IF NOT EXISTS → guard).
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ProposalStatus" AS ENUM ('Proposed', 'Confirmed', 'Rejected');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("✓ ProposalStatus enum");

  // 2. ExtractionProposal table (FKs inline so the whole table is created
  //     atomically on first run). Additive-only.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ExtractionProposal" (
      "id" TEXT NOT NULL,
      "status" "ProposalStatus" NOT NULL DEFAULT 'Proposed',
      "knowledgebaseId" TEXT NOT NULL,
      "assessmentId" TEXT NOT NULL,
      "auditChecklistItemId" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "spanStart" INTEGER NOT NULL,
      "spanEnd" INTEGER NOT NULL,
      "evidenceExcerpt" TEXT NOT NULL,
      "suggestedAction" TEXT,
      "proposedBy" TEXT NOT NULL DEFAULT 'AI',
      "proposedByUserId" TEXT,
      "confirmedByUserId" TEXT,
      "confirmedAt" TIMESTAMP(3),
      "rejectedByUserId" TEXT,
      "rejectedAt" TIMESTAMP(3),
      "transcriptTitle" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ExtractionProposal_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ExtractionProposal_knowledgebaseId_fkey" FOREIGN KEY ("knowledgebaseId") REFERENCES "Knowledgebase"("kID") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ExtractionProposal_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ExtractionProposal_auditChecklistItemId_fkey" FOREIGN KEY ("auditChecklistItemId") REFERENCES "AuditChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ExtractionProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  console.log("✓ ExtractionProposal table");

  // 3. Indexes (IF NOT EXISTS).
  const indexes = [
    ['CREATE INDEX IF NOT EXISTS "ExtractionProposal_companyId_status_idx" ON "ExtractionProposal"("companyId", "status");'],
    ['CREATE INDEX IF NOT EXISTS "ExtractionProposal_assessmentId_status_idx" ON "ExtractionProposal"("assessmentId", "status");'],
    ['CREATE INDEX IF NOT EXISTS "ExtractionProposal_auditChecklistItemId_idx" ON "ExtractionProposal"("auditChecklistItemId");'],
    ['CREATE INDEX IF NOT EXISTS "ExtractionProposal_knowledgebaseId_idx" ON "ExtractionProposal"("knowledgebaseId");'],
  ];
  for (const [sql] of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("✓ ExtractionProposal indexes");

  // 4. ActivityLogType audit rows (SAMS-002/004 convention). Idempotent upsert.
  const logTypes = [
    ["EVIDENCE_PROPOSAL_CREATED", "Evidence extracted from a transcript as a proposal"],
    ["EVIDENCE_PROPOSAL_CONFIRMED", "Evidence proposal confirmed (linked to checklist item)"],
    ["EVIDENCE_PROPOSAL_REJECTED", "Evidence proposal rejected (recorded, not resurfaced)"],
  ];
  for (const [activityType, description] of logTypes) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ActivityLogType" ("id", "activityType", "description", "createdAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("activityType") DO NOTHING`,
      `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      activityType,
      description
    );
    console.log(`✓ ActivityLogType ${activityType} row`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
