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

    // Find all AActUsers entries where this user is assigned
    const myAssignments = await prisma.aActUsers.findMany({
      where: { userId },
      include: {
        aact: {
          include: {
            assessment: {
              select: { id: true, name: true, status: true, assessor: { select: { name: true } } },
            },
            controls: {
              select: { id: true, controlId: true },
            },
            details: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Enrich controls with names
    const allControlIds = [...new Set(myAssignments.flatMap((a) => a.aact.controls.map((c) => c.controlId)))];
    const controlRecords = allControlIds.length > 0
      ? await prisma.control.findMany({ where: { id: { in: allControlIds } }, select: { id: true, name: true } })
      : [];
    const controlMap = new Map(controlRecords.map((c) => [c.id, c.name]));

    const interviews = myAssignments.map((assn) => ({
      assignmentId: assn.id,
      userRoles: assn.userRoles,
      remarks: assn.assignmentRemarks,
      activity: {
        id: assn.aact.id,
        aaID: assn.aact.aaID,
        activityName: assn.aact.activityName,
        activityDate: assn.aact.activityDate,
        activityStartTime: assn.aact.activityStartTime,
        activityEndTime: assn.aact.activityEndTime,
        activityDuration: assn.aact.activityDuration,
        activityDescription: assn.aact.activityDescription,
        typeId: assn.aact.assacttypeid,
        checklists: assn.aact.details?.[0]?.checklists ?? null,
        activityNotes: assn.aact.details?.[0]?.activityNotes ?? null,
        controls: assn.aact.controls.map((c) => ({
          id: c.id,
          controlId: c.controlId,
          name: controlMap.get(c.controlId) ?? c.controlId,
        })),
      },
      assessment: {
        id: assn.aact.assessment.id,
        name: assn.aact.assessment.name,
        status: assn.aact.assessment.status,
        assessorName: assn.aact.assessment.assessor?.name ?? "—",
      },
    }));

    return NextResponse.json({ interviews });
  } catch (error) {
    console.error("Error fetching interviews:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
