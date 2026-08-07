import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// POST /api/admin/assessments/[id]/controls/remove
// Bulk-remove control assignments by controlIds.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: assessmentId } = await params;
  const body = await req.json();
  const { controlIds } = body as { controlIds: string[] };

  if (!controlIds?.length) {
    return NextResponse.json({ error: "controlIds required" }, { status: 400 });
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const result = await prisma.controlAssignment.deleteMany({
    where: {
      assessmentId,
      controlId: { in: controlIds },
    },
  });

  return NextResponse.json({ removed: result.count, requested: controlIds.length });
}
