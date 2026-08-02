import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";

// POST /api/admin/assessments/[id]/adopt-checklist
// Body: { templateIds: string[] }
// Clones checklist template items into AuditChecklistItem for this assessment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id: assessmentId } = await params;
  const body = await req.json().catch(() => ({}));
  const templateIds: string[] = body.templateIds ?? [];

  if (!templateIds.length) {
    return NextResponse.json({ error: "At least one templateId is required" }, { status: 400 });
  }

  // Verify assessment exists
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  // Fetch template items
  const templateItems = await prisma.auditChecklistTemplateItem.findMany({
    where: { templateId: { in: templateIds } },
    include: { template: true },
    orderBy: { sortOrder: "asc" },
  });

  if (!templateItems.length) {
    return NextResponse.json({ error: "No template items found for the given templates" }, { status: 404 });
  }

  // Clone items into AuditChecklistItem (skip if already exists)
  let created = 0;
  let skipped = 0;

  for (const ti of templateItems) {
    const existing = await prisma.auditChecklistItem.findFirst({
      where: { checklistItemId: ti.checklistItemId, assessmentId },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.auditChecklistItem.create({
      data: {
        checklistItemId: ti.checklistItemId,
        checklistText: ti.checklistText,
        auditStandard: ti.auditStandard,
        sortOrder: ti.sortOrder,
        keyQuestions: ti.keyQuestions,
        whatGoodLooksLike: ti.whatGoodLooksLike,
        controlPoints: ti.controlPoints,
        evidenceRequirements: ti.evidenceRequirements,
        assessmentId,
        templateItemId: ti.id,
        templateId: ti.templateId,
      },
    });
    created++;
  }

  return NextResponse.json({
    created,
    skipped,
    templates: templateIds.length,
    items: templateItems.length,
  });
}

// DELETE /api/admin/assessments/[id]/adopt-checklist?templateId=xxx
// Removes all checklist items from the assessment that belong to the given template.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id: assessmentId } = await params;
  const templateId = req.nextUrl.searchParams.get("templateId");

  if (!templateId) {
    return NextResponse.json({ error: "templateId query parameter is required" }, { status: 400 });
  }

  // Verify assessment exists
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const result = await prisma.auditChecklistItem.deleteMany({
    where: { assessmentId, templateId },
  });

  return NextResponse.json({ deleted: result.count });
}
