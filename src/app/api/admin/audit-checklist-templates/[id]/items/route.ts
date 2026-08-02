import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SAMS_CUID = "comp_1783989395315";

// GET — list all items for a template
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await prisma.auditChecklistTemplateItem.findMany({
    where: { templateId: id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(items);
}

// POST — add item to template
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json();
  const { checklistItemId, checklistText, sortOrder, keyQuestions, whatGoodLooksLike, controlPoints, evidenceRequirements } = body;

  if (!checklistItemId || !checklistText) {
    return NextResponse.json({ error: "checklistItemId and checklistText are required" }, { status: 400 });
  }

  const template = await prisma.auditChecklistTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Guard: Global templates (SAMS001-owned) are read-only for non-SAMS001 companies
  if (template.companyId === SAMS_CUID && session.user?.companyId !== SAMS_CUID) {
    return NextResponse.json({ error: "Global templates are read-only. Use Copy to Local to add items." }, { status: 403 });
  }

  const item = await prisma.auditChecklistTemplateItem.create({
    data: {
      checklistItemId,
      checklistText,
      auditStandard: template.auditStandard,
      sortOrder: sortOrder ?? 0,
      keyQuestions: keyQuestions || null,
      whatGoodLooksLike: whatGoodLooksLike || null,
      controlPoints: controlPoints || null,
      evidenceRequirements: evidenceRequirements || null,
      templateId: id,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
