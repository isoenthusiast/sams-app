import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update a MapControl2Requirement mapping
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { requirementRId } = body;

    if (!requirementRId) {
      return NextResponse.json({ error: "requirementRId required" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "MapControl2Requirement" SET "requirementRId" = $1 WHERE id = $2`,
      requirementRId, id
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating MapControl2Requirement:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
