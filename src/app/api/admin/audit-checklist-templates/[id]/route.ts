import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update template name/description/standard
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json();
  const { name, description, auditStandard } = body;

  const existing = await prisma.auditChecklistTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

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

  const existing = await prisma.auditChecklistTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  await prisma.auditChecklistTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
