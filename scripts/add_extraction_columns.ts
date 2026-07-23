import { prisma } from "@/lib/prisma";

async function main() {
  console.log("Adding missing columns to DocumentExtract and ControlFromDocument...");

  // DocumentExtract: add companyId and updatedAt
  await prisma.$executeRawUnsafe(`ALTER TABLE "DocumentExtract" ADD COLUMN IF NOT EXISTS "companyId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DocumentExtract" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW()`);
  console.log("✓ DocumentExtract columns added");

  // ControlFromDocument: add status, approvedControlId, updatedAt
  await prisma.$executeRawUnsafe(`ALTER TABLE "ControlFromDocument" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Pending'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ControlFromDocument" ADD COLUMN IF NOT EXISTS "approvedControlId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ControlFromDocument" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW()`);
  console.log("✓ ControlFromDocument columns added");

  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
