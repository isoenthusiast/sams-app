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
    if (body.socStatus !== undefined) {
      const v = body.socStatus;
      if (v === null || v === "") {
        fields.push(`"socStatus" = NULL`);
      } else if (["FullyComply", "PartiallyComply", "NotComply"].includes(v)) {
        fields.push(`"socStatus" = $${idx++}::"SocStatus"`);
        values.push(v);
      } else {
        return NextResponse.json({ error: "Invalid socStatus" }, { status: 400 });
      }
    }
    if (body.socSummary !== undefined) {
      if (body.socSummary === null || body.socSummary === "") {
        fields.push(`"socSummary" = NULL`);
      } else {
        fields.push(`"socSummary" = $${idx++}`);
        values.push(String(body.socSummary).slice(0, 1000));
      }
    }

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
