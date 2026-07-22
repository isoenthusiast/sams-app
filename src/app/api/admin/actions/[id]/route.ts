import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update action fields
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

    if (body.actionDescription !== undefined) { fields.push(`"actionDescription" = $${idx++}`); values.push(body.actionDescription); }
    if (body.actionParty !== undefined) { fields.push(`"actionParty" = $${idx++}`); values.push(body.actionParty); }
    if (body.actionDetails !== undefined) { fields.push(`"actionDetails" = $${idx++}`); values.push(body.actionDetails); }
    if (body.targetDate !== undefined) { fields.push(`"targetDate" = $${idx++}`); values.push(body.targetDate ? new Date(body.targetDate) : null); }
    if (body.apAgreed !== undefined) { fields.push(`"apAgreed" = $${idx++}`); values.push(body.apAgreed); }
    if (body.actionTaken !== undefined) { fields.push(`"actionTaken" = $${idx++}`); values.push(body.actionTaken); }
    if (body.actionClosureEffective !== undefined) { fields.push(`"actionClosureEffective" = $${idx++}`); values.push(body.actionClosureEffective); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    await prisma.$executeRawUnsafe(
      `UPDATE "Action" SET ${fields.join(", ")} WHERE id = $${idx}`,
      ...values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating action:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove an action
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    await prisma.action.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting action:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
