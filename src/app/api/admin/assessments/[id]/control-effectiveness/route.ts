import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// PUT /api/admin/assessments/[id]/control-effectiveness
// Update control effectiveness, test notes, and test method.
// Body: { controlId: string, effective?: string, testNotes?: string, testMethod?: string }
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: assessmentId } = await params;
  const body = await req.json();
  const { controlId, effective, testNotes, testMethod } = body as {
    controlId: string;
    effective?: string;
    testNotes?: string;
    testMethod?: string;
  };

  if (!controlId) {
    return NextResponse.json(
      { error: "controlId is required" },
      { status: 400 }
    );
  }

  if (effective && !["Effective", "NotEffective"].includes(effective)) {
    return NextResponse.json(
      { error: "effective must be Effective or NotEffective" },
      { status: 400 }
    );
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const data: Record<string, any> = {};
  if (effective !== undefined) {
    data.effective = effective;
    data.effectiveUpdatedAt = new Date();
  }
  if (testNotes !== undefined) data.testNotes = testNotes || null;
  if (testMethod !== undefined) data.testMethod = testMethod || null;

  const result = await prisma.controlAssignment.updateMany({
    where: { assessmentId, controlId },
    data,
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Control not assigned to this assessment" },
      { status: 404 }
    );
  }

  return NextResponse.json({ controlId, effective, testNotes, testMethod, updatedAt: new Date().toISOString() });
}
