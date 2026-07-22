import { prisma } from "../src/lib/prisma";

async function main() {
  // Add Interviewee to Role enum (if not already added)
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'Interviewee'`);
    console.log("OK: Interviewee role added to enum");
  } catch (e: any) {
    if (e.message?.includes("already")) console.log("SKIP: Role enum already has Interviewee");
    else console.log("ENUM ERR:", e.message?.slice(0, 200));
  }

  // Create AssessmentAssessor table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AssessmentAssessor" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "assessmentId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AssessmentAssessor_assessmentId_userId_key" UNIQUE ("assessmentId", "userId")
      )
    `);
    console.log("OK: AssessmentAssessor table created/verified");

    // Add FKs (ignore if already exist)
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AssessmentAssessor" ADD CONSTRAINT "AssessmentAssessor_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"(id) ON DELETE CASCADE`
    ).catch(() => console.log("SKIP: assessmentId FK already exists"));
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AssessmentAssessor" ADD CONSTRAINT "AssessmentAssessor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE`
    ).catch(() => console.log("SKIP: userId FK already exists"));

    // Create indexes
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "AssessmentAssessor_assessmentId_idx" ON "AssessmentAssessor"("assessmentId")`
    ).catch(() => {});
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "AssessmentAssessor_userId_idx" ON "AssessmentAssessor"("userId")`
    ).catch(() => {});
    console.log("OK: Indexes ensured");
  } catch (e: any) {
    console.log("TABLE ERR:", e.message?.slice(0, 200));
  }

  // Backfill: for each existing assessment, add its assessorId to the junction
  try {
    const result = await prisma.$executeRawUnsafe(`
      INSERT INTO "AssessmentAssessor" ("id", "assessmentId", "userId", "createdAt")
      SELECT gen_random_uuid(), a.id, a."assessorId", a."createdAt"
      FROM "Assessment" a
      WHERE NOT EXISTS (
        SELECT 1 FROM "AssessmentAssessor" aa WHERE aa."assessmentId" = a.id AND aa."userId" = a."assessorId"
      )
    `);
    console.log("OK: Backfilled", result, "existing assessments");
  } catch (e: any) {
    console.log("BACKFILL ERR:", e.message?.slice(0, 200));
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
