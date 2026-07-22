import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function loadActivityExtras(activityId: string) {
  const [controls, users] = await Promise.all([
    prisma.aActControls.findMany({ where: { aaId: activityId } }),
    prisma.aActUsers.findMany({ where: { aaId: activityId } }),
  ]);

  const controlIds = [...new Set(controls.map((c) => c.controlId))];
  const userIds = [...new Set(users.map((u) => u.userId))];

  const [controlRecords, userRecords] = await Promise.all([
    controlIds.length ? prisma.control.findMany({ where: { id: { in: controlIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, username: true } }) : Promise.resolve([]),
  ]);

  const controlMap = new Map(controlRecords.map((c) => [c.id, c]));
  const userMap = new Map(userRecords.map((u) => [u.id, u]));

  return {
    controls: controls.map((c) => ({ id: c.id, controlId: c.controlId, control: controlMap.get(c.controlId) ?? null })),
    users: users.map((u) => ({ id: u.id, userId: u.userId, userRoles: u.userRoles, assignmentRemarks: u.assignmentRemarks, user: userMap.get(u.userId) ?? null })),
  };
}

// PUT — update an activity
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const {
      assacttypeid,
      activityName,
      activityDate,
      activityStartTime,
      activityEndTime,
      activityDuration,
      activityDescription,
    } = body;

    const activity = await prisma.aact.update({
      where: { id },
      data: {
        assacttypeid: assacttypeid ?? undefined,
        activityName: activityName ?? undefined,
        activityDate: activityDate ? new Date(activityDate) : undefined,
        activityStartTime: activityStartTime ?? undefined,
        activityEndTime: activityEndTime ?? undefined,
        activityDuration: activityDuration ?? undefined,
        activityDescription: activityDescription ?? undefined,
      },
      include: { details: true },
    });

    const extras = await loadActivityExtras(id);
    return NextResponse.json({ activity: { ...activity, ...extras } });
  } catch (error) {
    console.error("Error updating activity:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove an activity and its related records
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      await tx.aActUsers.deleteMany({ where: { aaId: id } });
      await tx.aActControls.deleteMany({ where: { aaId: id } });
      await tx.aActDetails.deleteMany({ where: { aaId: id } });
      await tx.aact.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting activity:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
