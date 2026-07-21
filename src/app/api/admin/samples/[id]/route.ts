import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update sample fields (status, conclusion, notes)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    // Build dynamic SET clause from provided fields
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.status !== undefined) { fields.push(`"status" = $${idx++}`); values.push(body.status); }
    if (body.conclusion !== undefined) { fields.push(`"conclusion" = $${idx++}`); values.push(body.conclusion); }
    if (body.notes !== undefined) { fields.push(`"notes" = $${idx++}`); values.push(body.notes); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    await prisma.$executeRawUnsafe(
      `UPDATE "Sample" SET ${fields.join(", ")} WHERE id = $${idx}`,
      ...values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating sample:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
