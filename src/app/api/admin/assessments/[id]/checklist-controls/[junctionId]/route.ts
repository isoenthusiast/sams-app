import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// DELETE /api/admin/assessments/[id]/checklist-controls/[junctionId]
// Unlinks a control from a checklist item.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; junctionId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { junctionId } = await params;

  const existing = await prisma.assessmentChecklistControl.findUnique({ where: { id: junctionId } });
  if (!existing) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  await prisma.assessmentChecklistControl.delete({ where: { id: junctionId } });

  return NextResponse.json({ success: true });
}
