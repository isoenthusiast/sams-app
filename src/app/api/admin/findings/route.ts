import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — create a new finding for an assessment
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { assessmentId, description, severity, risks, details, controlIds, repeat } = body;

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
      },
    });

    return NextResponse.json({ finding }, { status: 201 });
  } catch (error) {
    console.error("Error creating finding:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
