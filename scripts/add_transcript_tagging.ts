import { prisma } from "@/lib/prisma";

/**
 * Additive schema sync for ADR-0004 (transcript upload + tagging).
 * Only ADDs — never drops or alters existing objects, so it is safe against
 * the shared Postgres DB. Idempotent (IF NOT EXISTS everywhere).
 */
async function main() {
  console.log("Adding transcript + tagging schema (ADR-0004)…");

  // 1. Native enum type
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "KnowledgeEntryType" AS ENUM ('Knowledge', 'Transcript');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("✓ KnowledgeEntryType enum");

  // 2. Tag table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Tag" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "companyId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_companyId_key" ON "Tag" ("name", "companyId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Tag_name_idx" ON "Tag" ("name")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Tag_companyId_idx" ON "Tag" ("companyId")`);
  console.log("✓ Tag table");

  // 3. KnowledgebaseTag junction
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgebaseTag" (
      "id" TEXT PRIMARY KEY,
      "kID" TEXT NOT NULL,
      "tagId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgebaseTag_kID_tagId_key" ON "KnowledgebaseTag" ("kID", "tagId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgebaseTag_tagId_idx" ON "KnowledgebaseTag" ("tagId")`);
  console.log("✓ KnowledgebaseTag table");

  // 4. Knowledgebase columns
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Knowledgebase" ADD COLUMN IF NOT EXISTS "entryType" "KnowledgeEntryType" NOT NULL DEFAULT 'Knowledge'`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE "Knowledgebase" ADD COLUMN IF NOT EXISTS "meetingDate" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Knowledgebase" ADD COLUMN IF NOT EXISTS "participants" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Knowledgebase_entryType_idx" ON "Knowledgebase" ("entryType")`);
  console.log("✓ Knowledgebase columns (entryType, meetingDate, participants)");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
