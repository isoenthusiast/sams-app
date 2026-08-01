import { requireAdmin, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/admin/audit-checklist-templates/[id]/adopt
// Clones a global (SAMS001) template to the current company with [COMPANY] prefix.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const companyId = await getSelectedCompanyId();

  const source = await prisma.auditChecklistTemplate.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!source) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Get company code for prefix
  const company = await prisma.company.findUnique({ where: { id: companyId! }, select: { companyID: true } });
  const prefix = company?.companyID ?? "LOCAL";

  // Check if already adopted
  const adoptedName = `[${prefix}] ${source.name}`;
  const existing = await prisma.auditChecklistTemplate.findFirst({
    where: { name: adoptedName, companyId },
  });
  if (existing) {
    return NextResponse.json({ error: "Template already adopted", template: existing }, { status: 409 });
  }

  // Create local copy
  const local = await prisma.auditChecklistTemplate.create({
    data: {
      name: adoptedName,
      description: source.description,
      auditStandard: source.auditStandard,
      companyId,
    },
  });

  // Clone items
  let itemCount = 0;
  for (const item of source.items) {
    await prisma.auditChecklistTemplateItem.create({
      data: {
        checklistItemId: item.checklistItemId,
        checklistText: item.checklistText,
        auditStandard: item.auditStandard,
        sortOrder: item.sortOrder,
        keyQuestions: item.keyQuestions,
        whatGoodLooksLike: item.whatGoodLooksLike,
        controlPoints: item.controlPoints,
        evidenceRequirements: item.evidenceRequirements,
        templateId: local.id,
      },
    });
    itemCount++;
  }

  return NextResponse.json({
    template: local,
    itemsCloned: itemCount,
  }, { status: 201 });
}
