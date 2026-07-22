import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// DELETE — remove a user assignment from an activity
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id } = await params;
    await prisma.aActUsers.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing activity user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
