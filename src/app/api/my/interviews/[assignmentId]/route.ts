import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — acknowledge/accept an interview assignment
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = (session.user as { id?: string }).id;
    if (!userId) return NextResponse.json({ error: "No user id" }, { status: 400 });

    const { assignmentId } = await params;
    const body = await request.json();
    const { remarks } = body as { remarks?: string };

    // Verify the assignment belongs to this user
    const assignment = await prisma.aActUsers.findUnique({ where: { id: assignmentId } });
    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    if (assignment.userId !== userId) return NextResponse.json({ error: "Not your assignment" }, { status: 403 });

    await prisma.$executeRawUnsafe(
      `UPDATE "AActUsers" SET "acceptedAt" = NOW(), "acceptanceRemarks" = $1 WHERE id = $2`,
      remarks || null,
      assignmentId
    );

    return NextResponse.json({ success: true, acceptedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error acknowledging interview:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
