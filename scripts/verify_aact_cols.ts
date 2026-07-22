import { prisma } from "../src/lib/prisma";

async function main() {
  // Check exact column casing via pg_attribute
  const cols = await prisma.$queryRawUnsafe<Array<{ attname: string }>>(
    `SELECT a.attname FROM pg_catalog.pg_attribute a
     JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
     WHERE c.relname = 'AActUsers' AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`
  );
  console.log("AActUsers columns (exact casing):", cols.map((c: any) => c.attname).join(", "));

  // Try a direct Prisma query
  try {
    const users = await prisma.aActUsers.findFirst({ select: { acceptedAt: true } });
    console.log("Prisma query OK, acceptedAt:", users?.acceptedAt);
  } catch(e: any) {
    console.log("Prisma query FAILED:", String(e.message || e).slice(0, 200));
  }

  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
