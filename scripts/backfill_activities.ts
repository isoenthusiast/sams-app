import { prisma } from "../src/lib/prisma";

const DEFAULT_ACTIVITIES = [
  { name: "Auditee Engagement Meeting", type: "ACT-001", startTime: "09:00", endTime: "10:00", duration: "1h" },
  { name: "Kick Off Meeting", type: "ACT-001", startTime: "10:00", endTime: "11:00", duration: "1h" },
  { name: "Update Session (Findings and Observations)", type: "ACT-001", startTime: "11:00", endTime: "12:00", duration: "1h" },
  { name: "Closing and Report Out", type: "ACT-001", startTime: "13:00", endTime: "14:00", duration: "1h" },
  { name: "Controls Agreement Meeting (with Process Focal Point)", type: "ACT-001", startTime: "14:00", endTime: "15:00", duration: "1h" },
  { name: "Document Review", type: "ACT-002", startTime: "15:00", endTime: "17:00", duration: "2h", isMandatory: true },
];

function generateAaId(assessmentId: string, seq: number): string {
  const suffix = String(seq).padStart(2, "0");
  return `AA-${assessmentId.slice(-8)}-${suffix}`;
}

async function main() {
  // Find all assessments that don't yet have template activities
  const assessments = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; "startDate": Date }>>(
    `SELECT id, name, "startDate" FROM "Assessment" ORDER BY "createdAt"`
  );
  console.log(`Found ${assessments.length} assessments`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const a of assessments) {
    // Check if this assessment already has activities
    const existing = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*)::int as cnt FROM "Aact" WHERE "assuranceID" = $1`,
      a.id
    );
    const count = Number(existing[0]?.cnt ?? 0);
    if (count > 0) {
      console.log(`  SKIP: ${a.name} (already has ${count} activities)`);
      totalSkipped++;
      continue;
    }

    const activityDate = a.startDate
      ? new Date(a.startDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    for (let i = 0; i < DEFAULT_ACTIVITIES.length; i++) {
      const act = DEFAULT_ACTIVITIES[i];
      const aaId = generateAaId(a.id, i + 1);
      const uid = `${a.id.slice(-6)}_${i}`;

      await prisma.$executeRawUnsafe(
        `INSERT INTO "Aact" ("id", "aaID", "assuranceID", "assacttypeid", "activityName", "activityDate", "activityStartTime", "activityEndTime", "activityDuration", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        `aact_${uid}`,
        aaId,
        a.id,
        act.type,
        act.name,
        new Date(activityDate),
        act.startTime,
        act.endTime,
        act.duration,
      );

      await prisma.$executeRawUnsafe(
        `INSERT INTO "AActDetails" ("id", "aactDetID", "aaId", "checklists", "activityNotes", "createdAt")
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        `aactd_${uid}`,
        `AACTD-${aaId}`,
        aaId,
        act.isMandatory ? "Mandatory activity — must be completed before assessment closure." : null,
        null,
      );
    }

    console.log(`  OK: ${a.name} → ${DEFAULT_ACTIVITIES.length} activities created`);
    totalCreated++;
  }

  console.log(`\nDone: ${totalCreated} assessments backfilled, ${totalSkipped} skipped (already had activities)`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", String(e).slice(0, 500)); process.exit(1); });
