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
    const { requirementRId, mandatory } = body;

    if (requirementRId === undefined && mandatory === undefined) {
      return NextResponse.json({ error: "requirementRId or mandatory required" }, { status: 400 });
    }

    await prisma.mapControl2Requirement.update({
      where: { id },
      data: {
        ...(requirementRId !== undefined ? { requirementRId } : {}),
        ...(mandatory !== undefined ? { mandatory: Boolean(mandatory) } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating MapControl2Requirement:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove a control-requirement mapping
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;

    await prisma.$executeRawUnsafe(
      `DELETE FROM "MapControl2Requirement" WHERE id = $1`,
      id
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting MapControl2Requirement:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
