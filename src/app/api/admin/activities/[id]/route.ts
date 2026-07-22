import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function loadActivityExtras(activityId: string) {
  const [controls, users] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "AActControls" WHERE "aaId" = $1`, activityId),
    prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "AActUsers" WHERE "aaId" = $1`, activityId),
  ]);

  const controlIds = [...new Set(controls.map((c: any) => c.controlId))];
  const userIds = [...new Set(users.map((u: any) => u.userId))];

  const [controlRecords, userRecords] = await Promise.all([
    controlIds.length > 0
      ? prisma.$queryRawUnsafe<any[]>(`SELECT id, name FROM "Control" WHERE id IN (${controlIds.map((_, i) => `$${i + 1}`).join(", ")})`, ...controlIds)
      : Promise.resolve([]),
    userIds.length > 0
      ? prisma.$queryRawUnsafe<any[]>(`SELECT id, name, username FROM "User" WHERE id IN (${userIds.map((_, i) => `$${i + 1}`).join(", ")})`, ...userIds)
      : Promise.resolve([]),
  ]);

  const controlMap = new Map(controlRecords.map((c: any) => [c.id, c]));
  const userMap = new Map(userRecords.map((u: any) => [u.id, u]));

  return {
    controls: controls.map((c: any) => ({ id: c.id, controlId: c.controlId, control: controlMap.get(c.controlId) ?? null })),
    users: users.map((u: any) => ({ id: u.id, userId: u.userId, userRoles: u.userRoles, assignmentRemarks: u.assignmentRemarks, user: userMap.get(u.userId) ?? null })),
  };
}

// PUT — update an activity
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id } = await params;
    const body = await request.json();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.assacttypeid !== undefined) { fields.push(`"assacttypeid" = $${idx++}`); values.push(body.assacttypeid); }
    if (body.activityName !== undefined) { fields.push(`"activityName" = $${idx++}`); values.push(body.activityName); }
    if (body.activityDate !== undefined) { fields.push(`"activityDate" = $${idx++}`); values.push(new Date(body.activityDate)); }
    if (body.activityStartTime !== undefined) { fields.push(`"activityStartTime" = $${idx++}`); values.push(body.activityStartTime); }
    if (body.activityEndTime !== undefined) { fields.push(`"activityEndTime" = $${idx++}`); values.push(body.activityEndTime); }
    if (body.activityDuration !== undefined) { fields.push(`"activityDuration" = $${idx++}`); values.push(body.activityDuration); }
    if (body.activityDescription !== undefined) { fields.push(`"activityDescription" = $${idx++}`); values.push(body.activityDescription); }

    if (fields.length > 0) {
      values.push(id);
      await prisma.$executeRawUnsafe(
        `UPDATE "Aact" SET ${fields.join(", ")} WHERE id = $${idx}`,
        ...values
      );
    }

    // Fetch updated record
    const activity = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "Aact" WHERE id = $1`, id
    );
    const details = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "AActDetails" WHERE "aaId" = $1`, activity[0]?.aaID
    );
    const extras = await loadActivityExtras(activity[0]?.aaID);

    return NextResponse.json({
      activity: { ...activity[0], details: details ?? [], ...extras }
    });
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
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id } = await params;

    // Find the aaID first
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "aaID" FROM "Aact" WHERE id = $1`, id);
    const aaId = rows[0]?.aaID;
    if (aaId) {
      await prisma.$executeRawUnsafe(`DELETE FROM "AActUsers" WHERE "aaId" = $1`, aaId);
      await prisma.$executeRawUnsafe(`DELETE FROM "AActControls" WHERE "aaId" = $1`, aaId);
      await prisma.$executeRawUnsafe(`DELETE FROM "AActDetails" WHERE "aaId" = $1`, aaId);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Aact" WHERE id = $1`, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting activity:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
