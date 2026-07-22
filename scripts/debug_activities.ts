import { prisma } from "../src/lib/prisma";

async function main() {
  const aid = "cmr2vql7s00128w1txnvr06ni";

  // Exact same query as the API
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "Aact" WHERE "assuranceID" = $1 ORDER BY "activityDate" DESC`,
    aid
  );
  console.log("Count:", rows.length);
  if (rows.length > 0) console.log("First:", (rows[0] as any).activityName);

  // Also check what assessmentId the Aact records have
  const allIds = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT "assuranceID" FROM "Aact"`
  );
  console.log("All assuranceIDs in Aact:", allIds.map((r: any) => r.assuranceID));

  // Check the assessment
  const asm = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, name FROM "Assessment" WHERE id = $1`, aid
  );
  console.log("Assessment:", asm);

  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
