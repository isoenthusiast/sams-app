import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — map a control to an activity
export async function POST(request: Request) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const body = await request.json();
    const { aaId, controlId } = body;

    if (!aaId || !controlId) {
      return NextResponse.json(
        { error: "aaId and controlId are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.aActControls.findUnique({
      where: { aaId_controlId: { aaId, controlId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Control is already mapped to this activity" },
        { status: 409 }
      );
    }

    const mapping = await prisma.aActControls.create({
      data: {
        id: `ac_${Date.now()}`,
        aaId,
        controlId,
      },
    });

    const control = await prisma.control.findUnique({
      where: { id: controlId },
      select: { id: true, name: true },
    });

    return NextResponse.json({ mapping: { ...mapping, control } }, { status: 201 });
  } catch (error) {
    console.error("Error mapping activity control:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
