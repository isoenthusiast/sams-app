import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — create a control assignment for an assessment
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { assessmentId, controlId } = body;
    if (!assessmentId || !controlId) {
      return NextResponse.json({ error: "assessmentId and controlId required" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ControlAssignment" (id, "assessmentId", "controlId", "createdAt")
       VALUES ($1, $2, $3, NOW())`,
      `ca_${Date.now()}_${controlId.slice(-6)}`, assessmentId, controlId
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error creating control assignment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
