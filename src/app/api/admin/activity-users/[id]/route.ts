import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// DELETE — remove a user assignment from an activity
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { id } = await params;
    await prisma.aActUsers.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing activity user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
