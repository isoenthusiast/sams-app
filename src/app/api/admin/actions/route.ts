import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — create a new action for a finding
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { findingId, actionDescription, actionParty, actionDetails, targetDate, apAgreed } = body;

    if (!findingId || !actionDescription) {
      return NextResponse.json({ error: "findingId and actionDescription are required" }, { status: 400 });
    }

    // Verify finding exists
    const finding = await prisma.finding.findUnique({ where: { id: findingId } });
    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }

    const action = await prisma.action.create({
      data: {
        findingId,
        actionDescription,
        actionParty: actionParty || null,
        actionDetails: actionDetails || null,
        targetDate: targetDate ? new Date(targetDate) : null,
        apAgreed: apAgreed ?? false,
      },
    });

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    console.error("Error creating action:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
