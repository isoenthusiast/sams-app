import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// POST /api/admin/assessments/[id]/checklist-requirements
// Body: { checklistItemId, requirementRId, controlId, auditStandard }
// Links a control to a requirement under a checklist item
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: assessmentId } = await params;
  const body = await req.json();
  const { checklistItemId, requirementRId, controlId, auditStandard } = body;

  if (!checklistItemId || !requirementRId || !controlId || !auditStandard) {
    return NextResponse.json({ error: "checklistItemId, requirementRId, controlId, and auditStandard are required" }, { status: 400 });
  }

  // Get the checklist item text and requirement info
  const [item, requirement, control] = await Promise.all([
    prisma.auditChecklistItem.findFirst({ where: { checklistItemId, assessmentId } }),
    prisma.requirement.findUnique({ where: { rID: requirementRId } }),
    prisma.control.findUnique({ where: { id: controlId } }),
  ]);

  if (!item) return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
  if (!requirement) return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  if (!control) return NextResponse.json({ error: "Control not found" }, { status: 404 });

  // Check if already linked
  const existing = await prisma.auditChecklist2Requirement.findFirst({
    where: { checklistItemId, requirementRId, controlId },
  });
  if (existing) {
    return NextResponse.json({ mapping: existing, alreadyExists: true });
  }

  const mapping = await prisma.auditChecklist2Requirement.create({
    data: {
      checklistItemId,
      checklistText: item.checklistText,
      auditStandard,
      requirementRId,
      controlId,
      mappedBy: (session.user as { name?: string }).name || "assessor",
    },
  });

  return NextResponse.json({ mapping }, { status: 201 });
}

// DELETE /api/admin/assessments/[id]/checklist-requirements?mappingId=xxx
// Removes a control-to-requirement link
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const mappingId = req.nextUrl.searchParams.get("mappingId");
  if (!mappingId) {
    return NextResponse.json({ error: "mappingId query parameter is required" }, { status: 400 });
  }

  await prisma.auditChecklist2Requirement.delete({ where: { id: mappingId } });

  return NextResponse.json({ deleted: true });
}
