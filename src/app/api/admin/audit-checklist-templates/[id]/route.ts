import { requireAdmin } from "@/lib/authz";
import { getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SAMS_CUID = "comp_1783989395315";

// PUT — update template name/description/standard
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json();
  const { name, description, auditStandard } = body;
  const companyId = await getSelectedCompanyId();

  const existing = await prisma.auditChecklistTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Guard: Global templates (SAMS001-owned) are read-only for non-SAMS001 companies
  if (existing.companyId === SAMS_CUID && companyId !== SAMS_CUID) {
    return NextResponse.json({ error: "Global templates are read-only. Use Copy to Local to customize." }, { status: 403 });
  }

  const template = await prisma.auditChecklistTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(auditStandard !== undefined ? { auditStandard } : {}),
    },
  });

  return NextResponse.json({ template });
}

// DELETE — remove template and all its items (cascades)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const companyId = await getSelectedCompanyId();

  const existing = await prisma.auditChecklistTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Guard: Global templates (SAMS001-owned) cannot be deleted by non-SAMS001 companies
  if (existing.companyId === SAMS_CUID && companyId !== SAMS_CUID) {
    return NextResponse.json({ error: "Global templates cannot be deleted. They are shared with all companies." }, { status: 403 });
  }

  await prisma.auditChecklistTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
