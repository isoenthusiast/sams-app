import { requireAssessor, logActivity } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — create a new finding for an assessment
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAssessor();
    if (response) return response;

    const userId = (session.user as { id?: string }).id || "unknown";
    const body = await request.json();
    const { assessmentId, description, severity, risks, details, controlIds, repeat, sampleId } = body;

    if (!assessmentId || !description) {
      return NextResponse.json({ error: "assessmentId and description are required" }, { status: 400 });
    }

    // Generate FID-XXXXXX
    const count = await prisma.finding.count();
    const fid = `FID-${String(count + 1).padStart(6, "0")}`;

    const finding = await prisma.finding.create({
      data: {
        id: fid,
        assessmentId,
        description,
        severity: severity || "Low",
        risks: risks || null,
        details: details || null,
        controlIds: controlIds || null,
        repeat: repeat ?? false,
        sampleId: sampleId || null,
      },
    });

    await logActivity({
      userId,
      username: (session.user as { name?: string }).name || userId,
      action: "CREATE",
      entityType: "Finding",
      entityId: fid,
      summary: `Created finding: ${description.slice(0, 80)}`,
      metadata: { assessmentId, severity: severity || "Low", sampleId: sampleId || null },
    });

    return NextResponse.json({ finding }, { status: 201 });
  } catch (error) {
    console.error("Error creating finding:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
