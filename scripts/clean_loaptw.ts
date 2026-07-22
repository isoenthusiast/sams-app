import { prisma } from "../src/lib/prisma";

async function main() {
  // Find LOA PTW assessment and clean its partial activities
  const a = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT id, name FROM "Assessment" WHERE name = 'LOA PTW'`
  );
  if (a.length > 0) {
    const d = await prisma.$executeRawUnsafe(
      `DELETE FROM "AActDetails" WHERE "aaId" IN (SELECT "aaID" FROM "Aact" WHERE "assuranceID" = $1)`,
      a[0].id
    );
    const r = await prisma.$executeRawUnsafe(
      `DELETE FROM "Aact" WHERE "assuranceID" = $1`,
      a[0].id
    );
    console.log(`Cleaned ${a[0].name}: ${r} activities, ${d} details`);
  }
  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
