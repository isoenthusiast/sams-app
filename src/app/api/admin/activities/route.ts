import { requireAuth, requireSuperuser } from "@/lib/authz";
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
  const usersMap = new Map<string, Array<{ id: string; userId: string; userRoles: string; assignmentRemarks: string | null; user: { id: string; name: string | null; username: string } | null }>>();

  for (const c of controls) {
    const list = controlsMap.get(c.aaId) ?? [];
    list.push({ id: c.id, controlId: c.controlId, control: controlMap.get(c.controlId) ?? null });
    controlsMap.set(c.aaId, list);
  }
  for (const u of users) {
    const list = usersMap.get(u.aaId) ?? [];
    list.push({ id: u.id, userId: u.userId, userRoles: u.userRoles, assignmentRemarks: u.assignmentRemarks, user: userMap.get(u.userId) ?? null });
    usersMap.set(u.aaId, list);
  }

  return { controlsMap, usersMap };
}

// GET — list activities for an assessment
export async function GET(request: Request) {
  try {
    const { session, response } = await requireAuth();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const assessmentId = searchParams.get("assessmentId");
    if (!assessmentId) {
      return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
    }

    // Use raw SQL to bypass PrismaPg adapter introspection caching
    const activities = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "Aact" WHERE "assuranceID" = $1 ORDER BY "activityDate" DESC`,
      assessmentId
    );

    // Load details for each activity
    const detailRows = activities.length > 0
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "AActDetails" WHERE "aaId" IN (${activities.map((_, i) => `$${i + 1}`).join(", ")})`,
          ...activities.map((a: any) => a.aaID)
        )
      : [];

    const detailsMap = new Map<string, any[]>();
    for (const d of detailRows) {
      const list = detailsMap.get(d.aaId) ?? [];
      list.push(d);
      detailsMap.set(d.aaId, list);
    }

    // Load controls
    const controlRows = activities.length > 0
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "AActControls" WHERE "aaId" IN (${activities.map((_, i) => `$${i + 1}`).join(", ")})`,
          ...activities.map((a: any) => a.aaID)
        )
      : [];

    const controlIds = [...new Set(controlRows.map((c: any) => c.controlId))];
    const controlRecords = controlIds.length > 0
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, name FROM "Control" WHERE id IN (${controlIds.map((_, i) => `$${i + 1}`).join(", ")})`,
          ...controlIds
        )
      : [];
    const controlMap = new Map(controlRecords.map((c: any) => [c.id, c]));

    const controlsMap = new Map<string, any[]>();
    for (const c of controlRows) {
      const list = controlsMap.get(c.aaId) ?? [];
      list.push({ id: c.id, controlId: c.controlId, control: controlMap.get(c.controlId) ?? null });
      controlsMap.set(c.aaId, list);
    }

    // Load users
    const userRows = activities.length > 0
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "AActUsers" WHERE "aaId" IN (${activities.map((_, i) => `$${i + 1}`).join(", ")})`,
          ...activities.map((a: any) => a.aaID)
        )
      : [];

    const userIds = [...new Set(userRows.map((u: any) => u.userId))];
    const userRecords = userIds.length > 0
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, name, username FROM "User" WHERE id IN (${userIds.map((_, i) => `$${i + 1}`).join(", ")})`,
          ...userIds
        )
      : [];
    const userMap = new Map(userRecords.map((u: any) => [u.id, u]));

    const usersMap = new Map<string, any[]>();
    for (const u of userRows) {
      const list = usersMap.get(u.aaId) ?? [];
      list.push({ id: u.id, userId: u.userId, userRoles: u.userRoles, assignmentRemarks: u.assignmentRemarks, user: userMap.get(u.userId) ?? null });
      usersMap.set(u.aaId, list);
    }

    const enriched = activities.map((a: any) => ({
      id: a.id,
      aaID: a.aaID,
      assuranceID: a.assuranceID,
      assacttypeid: a.assacttypeid,
      activityName: a.activityName,
      activityDate: a.activityDate,
      activityStartTime: a.activityStartTime,
      activityEndTime: a.activityEndTime,
      activityDuration: a.activityDuration,
      activityDescription: a.activityDescription,
      createdAt: a.createdAt,
      details: detailsMap.get(a.aaID) ?? [],
      controls: controlsMap.get(a.aaID) ?? [],
      users: usersMap.get(a.aaID) ?? [],
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
    const { session, response } = await requireSuperuser();
    if (response) return response;

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
