import { requireSuperuser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// DELETE — remove a control mapping from an activity
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireSuperuser();
    if (response) return response;

    const { id } = await params;
    await prisma.aActControls.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing activity control:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
