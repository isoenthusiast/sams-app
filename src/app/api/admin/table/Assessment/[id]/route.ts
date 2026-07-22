import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update an assessment (status, endDate, etc.)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.status !== undefined) { fields.push(`"status" = $${idx++}::"AssessmentStatus"`); values.push(body.status); }
    if (body.name !== undefined) { fields.push(`"name" = $${idx++}`); values.push(body.name); }
    if (body.startDate !== undefined) { fields.push(`"startDate" = $${idx++}`); values.push(new Date(body.startDate)); }
    if (body.endDate !== undefined) { fields.push(`"endDate" = $${idx++}`); values.push(body.endDate ? new Date(body.endDate) : null); }
    if (body.loa !== undefined) { fields.push(`"loa" = $${idx++}::"LOA"`); values.push(body.loa); }
    if (body.assessorId !== undefined) { fields.push(`"assessorId" = $${idx++}`); values.push(body.assessorId); }
    if (body.activityTypeId !== undefined) { fields.push(`"activityTypeId" = $${idx++}`); values.push(body.activityTypeId); }
    if (body.companyId !== undefined) { fields.push(`"companyId" = $${idx++}`); values.push(body.companyId); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    await prisma.$executeRawUnsafe(
      `UPDATE "Assessment" SET ${fields.join(", ")} WHERE id = $${idx}`,
      ...values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating assessment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
