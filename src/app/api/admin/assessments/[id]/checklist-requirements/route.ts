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
    prisma.requirement.findUnique({ where: { rId: requirementRId } }),
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

  // Create placeholder evidence record then insert mapping via raw SQL
  const evidenceId = `ev_checklist_${Date.now()}_${controlId?.slice(-6) || "000000"}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AuditEvidence" (id, title, "evidenceType", "plannedDate", status, "createdAt")
     VALUES ($1, $2, 'DocumentReview'::"EvidenceType", NOW(), 'Conducted'::"EvidenceStatus", NOW())
     ON CONFLICT (id) DO NOTHING`,
    evidenceId, `Mapping: ${item.checklistItemId} → ${requirement?.requirementId || requirementRId}`
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AuditChecklist2Requirement" (id, "checklistItemId", "checklistText", "auditStandard", "requirementRId", "controlId", "evidenceGroupId", "mappedBy", "mappedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT DO NOTHING`,
    `acr_${Date.now()}_${controlId?.slice(-6) || "000000"}`,
    checklistItemId, item.checklistText, auditStandard,
    requirementRId, controlId, evidenceId,
    (session.user as { name?: string }).name || "assessor"
  );

  return NextResponse.json({ success: true, evidenceId }, { status: 201 });
}

// DELETE /api/admin/assessments/[id]/checklist-requirements?mappingId=xxx
// OR   /api/admin/assessments/[id]/checklist-requirements?checklistItemId=X&requirementRId=Y
// Removes a single control link, or all links for a requirement under a checklist item
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const mappingId = req.nextUrl.searchParams.get("mappingId");
  const checklistItemId = req.nextUrl.searchParams.get("checklistItemId");
  const requirementRId = req.nextUrl.searchParams.get("requirementRId");

  // Delete single control link
  if (mappingId) {
    await prisma.auditChecklist2Requirement.delete({ where: { id: mappingId } });
    return NextResponse.json({ deleted: true });
  }

  // Delete all mappings for a requirement under a checklist item (Unmap)
  if (checklistItemId && requirementRId) {
    const result = await prisma.auditChecklist2Requirement.deleteMany({
      where: { checklistItemId, requirementRId: parseInt(requirementRId) },
    });
    return NextResponse.json({ deleted: result.count });
  }

  return NextResponse.json({ error: "mappingId OR (checklistItemId + requirementRId) is required" }, { status: 400 });
}
