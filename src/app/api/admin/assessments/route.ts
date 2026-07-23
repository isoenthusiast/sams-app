import { requireSuperuser, getSelectedCompanyId, logActivity } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Default activity template — created for every new assessment.
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

// POST — create a new assessment with template activities
export async function POST(request: Request) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const userId = (session.user as { id?: string }).id;
    if (!userId) return NextResponse.json({ error: "No user id" }, { status: 400 });

    const companyId = await getSelectedCompanyId();
    const body = await request.json();
    const {
      name,
      controlIds,
      assessorIds,       // additional assessor user IDs (lead = current user)
      activityTypeId,
      loa,
      startDate,
    } = body;

    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!controlIds || controlIds.length === 0) return NextResponse.json({ error: "controlIds is required" }, { status: 400 });

    // Find default activity type (first one if not specified)
    let actTypeId = activityTypeId;
    if (!actTypeId) {
      const defaultType = await prisma.assuranceActivityType.findFirst({ orderBy: { createdAt: "asc" } });
      if (!defaultType) return NextResponse.json({ error: "No AssuranceActivityType found" }, { status: 500 });
      actTypeId = defaultType.id;
    }

    const assessmentId = `asmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create assessment
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Assessment" (id, "activityTypeId", name, "assessorId", "startDate", loa, status, "companyId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6::"LOA", $7::"AssessmentStatus", $8, NOW())`,
      assessmentId,
      actTypeId,
      name.trim(),
      userId,
      startDate ? new Date(startDate) : new Date(),
      loa || "SecondLine",
      "Planned",
      companyId || null,
    );

    // Create control assignments
    if (controlIds.length > 0) {
      const values: string[] = [];
      const params: any[] = [];
      controlIds.forEach((cid: string, i: number) => {
        const base = i * 3;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(`ca_${Date.now()}_${i}`, assessmentId, cid);
      });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ControlAssignment" (id, "assessmentId", "controlId") VALUES ${values.join(", ")}`,
        ...params
      );
    }

    // Create template activities
    const activityDate = startDate ? new Date(startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    for (let i = 0; i < DEFAULT_ACTIVITIES.length; i++) {
      const act = DEFAULT_ACTIVITIES[i];
      const aaId = generateAaId(assessmentId, i + 1);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Aact" (id, "aaID", "assuranceID", "assacttypeid", "activityName", "activityDate", "activityStartTime", "activityEndTime", "activityDuration", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        `aact_${Date.now()}_${i}`,
        aaId,
        assessmentId,
        act.type,
        act.name,
        new Date(activityDate),
        act.startTime,
        act.endTime,
        act.duration,
      );

      // Create AActDetails for checklist/notes
      await prisma.$executeRawUnsafe(
        `INSERT INTO "AActDetails" (id, "aactDetID", "aaId", "checklists", "activityNotes", "createdAt")
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        `aactd_${Date.now()}_${i}`,
        `AACTD-${aaId}`,
        aaId,
        act.isMandatory ? "Mandatory activity — must be completed before assessment closure." : null,
        null,
      );
    }

    // Create AssessmentAssessor entry for lead assessor
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AssessmentAssessor" ("id", "assessmentId", "userId", "createdAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("assessmentId", "userId") DO NOTHING`,
      `aa_${Date.now()}_lead`, assessmentId, userId
    );

    // Create AssessmentAssessor entries for additional assessors
    if (assessorIds && assessorIds.length > 0) {
      for (let i = 0; i < assessorIds.length; i++) {
        const aid = assessorIds[i];
        if (aid === userId) continue; // skip lead (already added)
        await prisma.$executeRawUnsafe(
          `INSERT INTO "AssessmentAssessor" ("id", "assessmentId", "userId", "createdAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("assessmentId", "userId") DO NOTHING`,
          `aa_${Date.now()}_${i}`, assessmentId, aid
        );
      }
    }

    // Log activity
    await logActivity({
      userId,
      username: (session.user as { name?: string }).name || userId,
      action: "CREATE",
      entityType: "Assessment",
      entityId: assessmentId,
      summary: `Created assessment: ${name.trim()}`,
      metadata: { controlCount: controlIds.length, loa: loa || "SecondLine" },
    });

    return NextResponse.json({ id: assessmentId, name: name.trim(), status: "Planned" }, { status: 201 });
  } catch (error) {
    console.error("Error creating assessment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
