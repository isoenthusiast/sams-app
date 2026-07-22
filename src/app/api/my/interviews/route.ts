import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — list interviews the current user is assigned to
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = (session.user as { id?: string }).id;
    if (!userId) return NextResponse.json({ error: "No user id" }, { status: 400 });

    // Raw SQL: find AActUsers → join Aact → join Assessment
    const myAssignments = await prisma.$queryRawUnsafe<any[]>(
      `SELECT au.id, au."userRoles", au."assignmentRemarks",
              a.id as "aactId", a."aaID", a."assuranceID", a."assacttypeid", a."activityName",
              a."activityDate", a."activityStartTime", a."activityEndTime", a."activityDuration", a."activityDescription",
              asm.id as "assessmentId", asm.name as "assessmentName", asm.status as "assessmentStatus",
              u.name as "assessorName"
       FROM "AActUsers" au
       JOIN "Aact" a ON a."aaID" = au."aaId"
       JOIN "Assessment" asm ON asm.id = a."assuranceID"
       LEFT JOIN "User" u ON u.id = asm."assessorId"
       WHERE au."userId" = $1
       ORDER BY au."createdAt" DESC`,
      userId
    );

    if (myAssignments.length === 0) return NextResponse.json({ interviews: [] });

    // Get controls for all activities
    const aaIds = [...new Set(myAssignments.map((a: any) => a.aaID))];
    const controlRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ac."aaId", ac."controlId", c.name as "controlName"
       FROM "AActControls" ac
       LEFT JOIN "Control" c ON c.id = ac."controlId"
       WHERE ac."aaId" IN (${aaIds.map((_, i) => `$${i + 1}`).join(", ")})`,
      ...aaIds
    );

    // Get details for all activities
    const detailRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "aaId", "checklists", "activityNotes"
       FROM "AActDetails"
       WHERE "aaId" IN (${aaIds.map((_, i) => `$${i + 1}`).join(", ")})`,
      ...aaIds
    );

    const controlsMap = new Map<string, any[]>();
    for (const c of controlRows) {
      const list = controlsMap.get(c.aaId) ?? [];
      list.push({ id: "", controlId: c.controlId, name: c.controlName ?? c.controlId });
      controlsMap.set(c.aaId, list);
    }

    const detailsMap = new Map<string, any>();
    for (const d of detailRows) {
      if (!detailsMap.has(d.aaId)) detailsMap.set(d.aaId, d);
    }

    const interviews = myAssignments.map((assn: any) => ({
      assignmentId: assn.id,
      userRoles: assn.userRoles,
      remarks: assn.assignmentRemarks,
      activity: {
        id: assn.aactId,
        aaID: assn.aaID,
        activityName: assn.activityName,
        activityDate: assn.activityDate,
        activityStartTime: assn.activityStartTime,
        activityEndTime: assn.activityEndTime,
        activityDuration: assn.activityDuration,
        activityDescription: assn.activityDescription,
        typeId: assn.assacttypeid,
        checklists: detailsMap.get(assn.aaID)?.checklists ?? null,
        activityNotes: detailsMap.get(assn.aaID)?.activityNotes ?? null,
        controls: controlsMap.get(assn.aaID) ?? [],
      },
      assessment: {
        id: assn.assessmentId,
        name: assn.assessmentName,
        status: assn.assessmentStatus,
        assessorName: assn.assessorName ?? "—",
      },
    }));

    return NextResponse.json({ interviews });
  } catch (error) {
    console.error("Error fetching interviews:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
