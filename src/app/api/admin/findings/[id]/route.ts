import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update finding fields
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

    if (body.description !== undefined) { fields.push(`"description" = $${idx++}`); values.push(body.description); }
    if (body.severity !== undefined) { fields.push(`"severity" = $${idx++}`); values.push(body.severity); }
    if (body.risks !== undefined) { fields.push(`"risks" = $${idx++}`); values.push(body.risks); }
    if (body.details !== undefined) { fields.push(`"details" = $${idx++}`); values.push(body.details); }
    if (body.controlIds !== undefined) { fields.push(`"controlIds" = $${idx++}`); values.push(body.controlIds); }
    if (body.repeat !== undefined) { fields.push(`"repeat" = $${idx++}`); values.push(body.repeat); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    await prisma.$executeRawUnsafe(
      `UPDATE "Finding" SET ${fields.join(", ")} WHERE id = $${idx}`,
      ...values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating finding:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove a finding (cascades to actions)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    await prisma.finding.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting finding:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
