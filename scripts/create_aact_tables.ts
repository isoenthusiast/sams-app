import { prisma } from "../src/lib/prisma";

async function main() {
  // Create Aact table if not exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Aact" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "aaID" TEXT NOT NULL UNIQUE,
      "assuranceID" TEXT NOT NULL,
      "assacttypeid" TEXT NOT NULL,
      "activityName" TEXT NOT NULL,
      "activityDate" TIMESTAMP(3) NOT NULL,
      "activityStartTime" TEXT NOT NULL,
      "activityEndTime" TEXT NOT NULL,
      "activityDuration" TEXT,
      "activityDescription" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Aact" ADD CONSTRAINT "Aact_assuranceID_fkey" FOREIGN KEY ("assuranceID") REFERENCES "Assessment"(id) ON DELETE CASCADE`).catch(() => {});
  console.log("OK: Aact table");

  // Create AActControls junction
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AActControls" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "aaId" TEXT NOT NULL,
      "controlId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AActControls_aaId_controlId_key" UNIQUE ("aaId", "controlId")
    )
  `);
  console.log("OK: AActControls table");

  // Create AActUsers junction with acceptance fields
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AActUsers" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "aaId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "userRoles" TEXT NOT NULL,
      "assignmentRemarks" TEXT,
      "acceptedAt" TIMESTAMP(3),
      "acceptanceRemarks" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AActUsers_aaId_userId_key" UNIQUE ("aaId", "userId")
    )
  `);
  console.log("OK: AActUsers table (with acceptance fields)");

  // Create AActDetails table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AActDetails" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "aactDetID" TEXT NOT NULL UNIQUE,
      "aaId" TEXT NOT NULL,
      "detail" TEXT,
      "summaryAgainstControls" TEXT,
      "checklists" TEXT,
      "activityNotes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("OK: AActDetails table");

  // Indexes
  for (const idx of [
    `CREATE INDEX IF NOT EXISTS "AActControls_aaId_idx" ON "AActControls"("aaId")`,
    `CREATE INDEX IF NOT EXISTS "AActControls_controlId_idx" ON "AActControls"("controlId")`,
    `CREATE INDEX IF NOT EXISTS "AActUsers_aaId_idx" ON "AActUsers"("aaId")`,
    `CREATE INDEX IF NOT EXISTS "AActUsers_userId_idx" ON "AActUsers"("userId")`,
    `CREATE INDEX IF NOT EXISTS "AActDetails_aaId_idx" ON "AActDetails"("aaId")`,
  ]) {
    await prisma.$executeRawUnsafe(idx).catch(() => {});
  }
  console.log("OK: Indexes");

  // Add acceptance columns (in case table existed without them)
  for (const col of [
    { name: "acceptedAt", type: "TIMESTAMP(3)" },
    { name: "acceptanceRemarks", type: "TEXT" },
  ]) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "AActUsers" ADD COLUMN "${col.name}" ${col.type}`);
      console.log("OK: Added column", col.name);
    } catch (e: any) {
      const msg = String(e.message || e);
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        console.log("SKIP:", col.name);
      } else {
        console.log("COL ERR:", col.name, msg.slice(0, 100));
      }
    }
  }

  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", String(e).slice(0, 300)); process.exit(1); });
