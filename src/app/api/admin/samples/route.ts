import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — create a new sample for an assessment
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { assessmentId, sampleTypeId, recordSourceId, recordReference, comment } = body;

    if (!assessmentId) {
      return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
    }

    // Verify assessment exists
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    const sample = await prisma.sample.create({
      data: {
        assessmentId,
        sampleTypeId: sampleTypeId || null,
        recordSourceId: recordSourceId || null,
        recordReference: recordReference || null,
        comment: comment || null,
        status: "NotTested",
        controlEffective: false,
      },
      include: {
        sampleType: true,
        recordSource: true,
      },
    });

    return NextResponse.json({ sample }, { status: 201 });
  } catch (error) {
    console.error("Error creating sample:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
