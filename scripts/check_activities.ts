import { prisma } from "../src/lib/prisma";

async function main() {
  // Show all assessments and their activity counts
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; status: string; act_count: number }>>(
    `SELECT a.id, a.name, a.status, COUNT(act.id)::int as act_count
     FROM "Assessment" a
     LEFT JOIN "Aact" act ON act."assuranceID" = a.id
     GROUP BY a.id, a.name, a.status
     ORDER BY a."createdAt"`
  );
  for (const r of rows) {
    console.log(`${r.name} (${r.status}): ${r.act_count} activities [${r.id}]`);
  }

  // Also show the first few activities
  const acts = await prisma.$queryRawUnsafe<Array<{ "aaID": string; "assuranceID": string; "activityName": string }>>(
    `SELECT "aaID", "assuranceID", "activityName" FROM "Aact" ORDER BY "createdAt" LIMIT 10`
  );
  console.log("\nSample activities:");
  for (const a of acts) {
    console.log(`  ${a.aaID} → ${a.assuranceID}: ${a.activityName}`);
  }

  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
