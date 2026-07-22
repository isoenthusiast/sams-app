import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Helpers to enrich activities with related controls/users without relying on
// Prisma relations that do not exist on AActControls / AActUsers.
async function loadActivityExtras(activities: { id: string }[]) {
  if (activities.length === 0) return { controlsMap: new Map(), usersMap: new Map() };
  const ids = activities.map((a) => a.id);
  const [controls, users] = await Promise.all([
    prisma.aActControls.findMany({ where: { aaId: { in: ids } } }),
    prisma.aActUsers.findMany({ where: { aaId: { in: ids } } }),
  ]);

  const controlIds = [...new Set(controls.map((c) => c.controlId))];
  const userIds = [...new Set(users.map((u) => u.userId))];

  const [controlRecords, userRecords] = await Promise.all([
    controlIds.length ? prisma.control.findMany({ where: { id: { in: controlIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, username: true } }) : Promise.resolve([]),
  ]);

  const controlMap = new Map(controlRecords.map((c) => [c.id, c]));
  const userMap = new Map(userRecords.map((u) => [u.id, u]));

  const controlsMap = new Map<string, Array<{ id: string; controlId: string; control: { id: string; name: string } | null }>>();
  const usersMap = new Map<string, Array<{ id: string; userId: string; userRoles: string; assignmentRemarks: string | null; acceptedAt: string | null; acceptanceRemarks: string | null; user: { id: string; name: string | null; username: string } | null }>>();

  for (const c of controls) {
    const list = controlsMap.get(c.aaId) ?? [];
    list.push({ id: c.id, controlId: c.controlId, control: controlMap.get(c.controlId) ?? null });
    controlsMap.set(c.aaId, list);
  }
  for (const u of users) {
    const list = usersMap.get(u.aaId) ?? [];
    list.push({ id: u.id, userId: u.userId, userRoles: u.userRoles, assignmentRemarks: u.assignmentRemarks, acceptedAt: u.acceptedAt?.toISOString() ?? null, acceptanceRemarks: u.acceptanceRemarks, user: userMap.get(u.userId) ?? null });
    usersMap.set(u.aaId, list);
  }

  return { controlsMap, usersMap };
}

// GET — list activities for an assessment
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const assessmentId = searchParams.get("assessmentId");
    if (!assessmentId) {
      return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
    }

    const activities = await prisma.aact.findMany({
      where: { assuranceID: assessmentId },
      include: { details: true },
      orderBy: { activityDate: "desc" },
    });

    const { controlsMap, usersMap } = await loadActivityExtras(activities);

    const enriched = activities.map((a) => ({
      ...a,
      controls: controlsMap.get(a.id) ?? [],
      users: usersMap.get(a.id) ?? [],
    }));

    return NextResponse.json({ activities: enriched });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create a new assessment activity
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const {
      assuranceID,
      assacttypeid,
      activityName,
      activityDate,
      activityStartTime,
      activityEndTime,
      activityDuration,
      activityDescription,
    } = body;

    if (!assuranceID || !assacttypeid || !activityName || !activityDate) {
      return NextResponse.json(
        { error: "assuranceID, assacttypeid, activityName, and activityDate are required" },
        { status: 400 }
      );
    }

    const aaID = `AA-${Date.now()}`;
    const activity = await prisma.aact.create({
      data: {
        id: `aact_${Date.now()}`,
        aaID,
        assuranceID,
        assacttypeid,
        activityName,
        activityDate: new Date(activityDate),
        activityStartTime: activityStartTime || "09:00",
        activityEndTime: activityEndTime || "10:00",
        activityDuration: activityDuration || null,
        activityDescription: activityDescription || null,
      },
      include: { details: true },
    });

    return NextResponse.json({ activity: { ...activity, controls: [], users: [] } }, { status: 201 });
  } catch (error) {
    console.error("Error creating activity:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
