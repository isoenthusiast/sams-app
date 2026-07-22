import { requireAuth, requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — sync the list of additional assessors for an assessment
// (The lead assessor is managed via the main Assessment PUT endpoint.)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id: assessmentId } = await params;
    const body = await request.json();
    const { userIds } = body as { userIds?: string[] };

    // Verify assessment exists
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Remove existing additional assessors (keep lead assessor if they're in the list)
    await prisma.$executeRawUnsafe(
      `DELETE FROM "AssessmentAssessor" WHERE "assessmentId" = $1 AND "userId" != $2`,
      assessmentId,
      assessment.assessorId
    );

    // Insert new assessors (skip lead — they're already in via backfill or creation)
    if (userIds && userIds.length > 0) {
      for (const userId of userIds) {
        if (userId === assessment.assessorId) continue; // skip lead
        await prisma.$executeRawUnsafe(
          `INSERT INTO "AssessmentAssessor" ("id", "assessmentId", "userId", "createdAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("assessmentId", "userId") DO NOTHING`,
          `aa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          assessmentId,
          userId
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error syncing assessors:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — list assessor IDs for an assessment
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireAuth();
    if (response) return response;

    const { id: assessmentId } = await params;
    const links = await prisma.assessmentAssessor.findMany({
      where: { assessmentId },
      select: { userId: true },
    });

    return NextResponse.json({ userIds: links.map((l) => l.userId) });
  } catch (error) {
    console.error("Error fetching assessors:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
