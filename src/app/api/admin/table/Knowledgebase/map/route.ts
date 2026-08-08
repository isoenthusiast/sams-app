import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — batch-map multiple Knowledgebase entries to a ProcessArea
// body: { ids: string[], processAreaId: string | null }
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { ids, processAreaId } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids (array) required" }, { status: 400 });
    }

    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "Knowledgebase" SET "processAreaId" = $1 WHERE "kID" = ANY($2::text[])`,
      processAreaId || null,
      ids
    );

    return NextResponse.json({ success: true, updated, processAreaId: processAreaId || null });
  } catch (error) {
    console.error("Error batch-mapping knowledgebase entries:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
