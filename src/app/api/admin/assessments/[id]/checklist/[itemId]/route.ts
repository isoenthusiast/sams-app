import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// PATCH /api/admin/assessments/[id]/checklist/[itemId]
// Body: { complianceStatus?, auditorNotes?, evidenceMethod?, testedBy? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { itemId } = await params;
  const body = await req.json().catch(() => ({}));

  const item = await prisma.auditChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) {
    return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.complianceStatus !== undefined) data.complianceStatus = body.complianceStatus;
  if (body.auditorNotes !== undefined) data.auditorNotes = body.auditorNotes;
  if (body.evidenceMethod !== undefined) data.evidenceMethod = body.evidenceMethod;
  if (body.testedBy !== undefined) {
    data.testedBy = body.testedBy;
    data.testedDate = new Date();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.auditChecklistItem.update({
    where: { id: itemId },
    data,
  });

  return NextResponse.json({
    id: updated.id,
    checklistItemId: updated.checklistItemId,
    complianceStatus: updated.complianceStatus,
    auditorNotes: updated.auditorNotes,
    testedDate: updated.testedDate?.toISOString() ?? null,
    testedBy: updated.testedBy,
  });
}
