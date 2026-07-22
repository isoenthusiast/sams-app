import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// DELETE — remove a control assignment
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id } = await params;
    await prisma.$executeRawUnsafe(`DELETE FROM "ControlAssignment" WHERE id = $1`, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting control assignment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — update effectiveness on a control assignment
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id } = await params;
    const body = await request.json();
    const { effective } = body;

    await prisma.$executeRawUnsafe(
      `UPDATE "ControlAssignment" SET "effective" = $1 WHERE id = $2`,
      effective || null, id
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating control assignment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
