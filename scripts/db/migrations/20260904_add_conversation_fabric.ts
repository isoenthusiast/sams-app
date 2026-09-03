import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for SAMS-004 (Conversation Fabric — threaded comments +
 * evidence-request pipeline), Phase 2a of the managed GRA SaaS roadmap.
 *
 * Adds the `Comment` (polymorphic, entityType+entityId) and `EvidenceRequest`
 * DRL-unit tables + their enums and indexes, and registers two new
 * ActivityLogType reference rows (EVIDENCE_REQUEST_CREATED /
 * EVIDENCE_REQUEST_STATUS).
 *
 * ONLY ADDs — never drops or alters existing objects, so it is safe against the
 * shared Postgres DB (no `prisma db push`). Idempotent: every statement guards
 * with IF NOT EXISTS / duplicate_object / ON CONFLICT, so it can be run
 * repeatedly.
 *
 * Deploy order (§6 of CONAN_ConversationFabric_Design.md): migration → generate →
 * build → E2E. Conan applies this manually (`npx tsx scripts/db/migrations/...`)
 * before the Railway build runs `prisma generate && npm run build`.
 *
 * Manages:
 *   1. `CommentAuthorPlane` enum (Provider | Client).
 *   2. `CommentVisibility` enum (Internal | SharedWithClient).
 *   3. `EvidenceRequestStatus` enum (Draft | Requested | Submitted | Accepted |
 *      Rejected | NotApplicable).
 *   4. `Comment` table (polymorphic entityType+entityId, flat parentCommentId
 *      self-ref, FK → User.author, indexes on (entityType, entityId),
 *      (companyId), (authorUserId)).
 *   5. `EvidenceRequest` table (FK → Assessment optional, FK → User ×2,
 *      DFK default Draft, indexes on (companyId, status) and
 *      (requestedFromUserId, status)).
 *   6. `ActivityLogType` rows EVIDENCE_REQUEST_CREATED / EVIDENCE_REQUEST_STATUS.
 */
async function main() {
  console.log("Adding Conversation Fabric schema (SAMS-004)…");

  // 1-3. Native enum types. Postgres has no CREATE TYPE IF NOT EXISTS, so guard
  //     with an exception block (same pattern as the SAMS-002 migration).
  const enums: Array<[string, string]> = [
    ["CommentAuthorPlane", "'Provider', 'Client'"],
    ["CommentVisibility", "'Internal', 'SharedWithClient'"],
    ["EvidenceRequestStatus", "'Draft', 'Requested', 'Submitted', 'Accepted', 'Rejected', 'NotApplicable'"],
  ];
  for (const [name, values] of enums) {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "${name}" AS ENUM (${values});
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log(`✓ ${name} enum`);
  }

  // 4. Comment table. Additive-only; FK inline so the whole table is created
  //     atomically on first run.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Comment" (
      "id" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "parentCommentId" TEXT,
      "authorUserId" TEXT NOT NULL,
      "authorPlane" "CommentAuthorPlane" NOT NULL DEFAULT 'Provider',
      "visibility" "CommentVisibility" NOT NULL DEFAULT 'Internal',
      "body" TEXT NOT NULL,
      "companyId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Comment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Comment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  console.log("✓ Comment table");

  // 5. EvidenceRequest table.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EvidenceRequest" (
      "id" TEXT NOT NULL,
      "companyId" TEXT,
      "assessmentId" TEXT,
      "requirementRId" INTEGER,
      "controlId" TEXT,
      "title" TEXT NOT NULL,
      "instructions" TEXT NOT NULL,
      "requestedByUserId" TEXT NOT NULL,
      "requestedFromUserId" TEXT NOT NULL,
      "dueDate" TIMESTAMP(3),
      "status" "EvidenceRequestStatus" NOT NULL DEFAULT 'Draft',
      "submittedNote" TEXT,
      "reviewNote" TEXT,
      "submittedAt" TIMESTAMP(3),
      "reviewedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "EvidenceRequest_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "EvidenceRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "EvidenceRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "EvidenceRequest_requestedFromUserId_fkey" FOREIGN KEY ("requestedFromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  console.log("✓ EvidenceRequest table");

  // Indexes (IF NOT EXISTS).
  const indexes = [
    ['CREATE INDEX IF NOT EXISTS "Comment_entityType_entityId_idx" ON "Comment"("entityType", "entityId");'],
    ['CREATE INDEX IF NOT EXISTS "Comment_companyId_idx" ON "Comment"("companyId");'],
    ['CREATE INDEX IF NOT EXISTS "Comment_authorUserId_idx" ON "Comment"("authorUserId");'],
    ['CREATE INDEX IF NOT EXISTS "EvidenceRequest_companyId_status_idx" ON "EvidenceRequest"("companyId", "status");'],
    ['CREATE INDEX IF NOT EXISTS "EvidenceRequest_requestedFromUserId_status_idx" ON "EvidenceRequest"("requestedFromUserId", "status");'],
  ];
  for (const [sql] of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log("✓ Comment + EvidenceRequest indexes");

  // 6. ActivityLogType reference rows (audit-trail). Idempotent upsert.
  const logTypes = [
    ["EVIDENCE_REQUEST_CREATED", "Evidence request created"],
    ["EVIDENCE_REQUEST_STATUS", "Evidence request status transition"],
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
