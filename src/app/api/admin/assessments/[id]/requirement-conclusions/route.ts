import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// PUT /api/admin/assessments/[id]/requirement-conclusions
// Upsert a requirement conclusion for this assessment.
// Body: { requirementRId: number, conclusion: "FullyMet" | "PartiallyMet" | "NotMet", narrative?: string, lastAssessedDate?: string }
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
  const { requirementRId, conclusion, narrative, lastAssessedDate } = body as {
    requirementRId: number;
    conclusion: string;
    narrative?: string;
    lastAssessedDate?: string;
  };

  if (!requirementRId || !conclusion) {
    return NextResponse.json(
      { error: "requirementRId and conclusion are required" },
      { status: 400 }
    );
  }

  if (!["FullyMet", "PartiallyMet", "NotMet"].includes(conclusion)) {
    return NextResponse.json(
      { error: "conclusion must be FullyMet, PartiallyMet, or NotMet" },
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

  const result = await prisma.requirementConclusion.upsert({
    where: {
      assessmentId_requirementRId: {
        assessmentId,
        requirementRId,
      },
    },
    create: {
      assessmentId,
      requirementRId,
      conclusion: conclusion as any,
      narrative: narrative ?? null,
      lastAssessedDate: lastAssessedDate ? new Date(lastAssessedDate) : new Date(),
    },
    update: {
      conclusion: conclusion as any,
      narrative: narrative ?? null,
      lastAssessedDate: lastAssessedDate ? new Date(lastAssessedDate) : new Date(),
    },
  });

  return NextResponse.json({
    id: result.id,
    requirementRId: result.requirementRId,
    conclusion: result.conclusion,
    narrative: result.narrative,
    lastAssessedDate: result.lastAssessedDate?.toISOString() ?? null,
  });
}
