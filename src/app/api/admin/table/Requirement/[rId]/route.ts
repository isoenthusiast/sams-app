import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update a Requirement
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ rId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { rId } = await params;
    const body = await request.json();

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.requirementId !== undefined) { fields.push(`"requirementId" = $${idx++}`); values.push(body.requirementId); }
    if (body.clauseContent !== undefined) { fields.push(`"clauseContent" = $${idx++}`); values.push(body.clauseContent); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(parseInt(rId, 10));
    await prisma.$executeRawUnsafe(
      `UPDATE "Requirement" SET ${fields.join(", ")} WHERE "rID" = $${idx}`,
      ...values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating requirement:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
