import { requireAdmin } from "@/lib/authz";
import { getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SAMS_CUID = "comp_1783989395315";

// Check if template is a global template owned by SAMS001
async function isGlobalTemplate(templateId: string): Promise<boolean> {
  const t = await prisma.auditChecklistTemplate.findUnique({ where: { id: templateId }, select: { companyId: true } });
  return t?.companyId === SAMS_CUID;
}

// PUT — update template item (all fields)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id: templateId, itemId } = await params;
  const body = await request.json();
  const { checklistItemId, checklistText, sortOrder, keyQuestions, whatGoodLooksLike, controlPoints, evidenceRequirements } = body;
  const companyId = await getSelectedCompanyId();

  const existing = await prisma.auditChecklistTemplateItem.findUnique({ where: { id: itemId } });
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // Guard: Global template items are read-only for non-SAMS001
  if (await isGlobalTemplate(templateId) && companyId !== SAMS_CUID) {
    return NextResponse.json({ error: "Global template items are read-only. Use Copy to Local to customize." }, { status: 403 });
  }

  const item = await prisma.auditChecklistTemplateItem.update({
    where: { id: itemId },
    data: {
      ...(checklistItemId !== undefined ? { checklistItemId } : {}),
      ...(checklistText !== undefined ? { checklistText } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(keyQuestions !== undefined ? { keyQuestions } : {}),
      ...(whatGoodLooksLike !== undefined ? { whatGoodLooksLike } : {}),
      ...(controlPoints !== undefined ? { controlPoints } : {}),
      ...(evidenceRequirements !== undefined ? { evidenceRequirements } : {}),
    },
  });

  return NextResponse.json({ item });
}

// DELETE — remove template item
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id: templateId, itemId } = await params;
  const companyId = await getSelectedCompanyId();

  const existing = await prisma.auditChecklistTemplateItem.findUnique({ where: { id: itemId } });
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // Guard: Global template items cannot be deleted by non-SAMS001
  if (await isGlobalTemplate(templateId) && companyId !== SAMS_CUID) {
    return NextResponse.json({ error: "Global template items cannot be deleted. Use Copy to Local to customize." }, { status: 403 });
  }

  await prisma.auditChecklistTemplateItem.delete({ where: { id: itemId } });

  return NextResponse.json({ success: true });
}
