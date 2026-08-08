import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PATCH — update a Knowledgebase entry's processAreaId (map to Standard/ProcessArea)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { processAreaId } = body;

    if (!id) return NextResponse.json({ error: "kID required" }, { status: 400 });

    await prisma.$executeRawUnsafe(
      `UPDATE "Knowledgebase" SET "processAreaId" = $1 WHERE "kID" = $2`,
      processAreaId || null,
      id
    );

    return NextResponse.json({ success: true, kID: id, processAreaId: processAreaId || null });
  } catch (error) {
    console.error("Error updating knowledgebase entry:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
