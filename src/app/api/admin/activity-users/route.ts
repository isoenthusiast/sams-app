import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — assign a user to an activity
export async function POST(request: Request) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const body = await request.json();
    const { aaId, userId, userRoles, assignmentRemarks } = body;

    if (!aaId || !userId || !userRoles) {
      return NextResponse.json(
        { error: "aaId, userId, and userRoles are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.aActUsers.findUnique({
      where: { aaId_userId: { aaId, userId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User is already assigned to this activity" },
        { status: 409 }
      );
    }

    const assignment = await prisma.aActUsers.create({
      data: {
        id: `au_${Date.now()}`,
        aaId,
        userId,
        userRoles,
        assignmentRemarks: assignmentRemarks || null,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true },
    });

    return NextResponse.json({ assignment: { ...assignment, user } }, { status: 201 });
  } catch (error) {
    console.error("Error assigning activity user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
