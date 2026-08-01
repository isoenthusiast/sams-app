import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update template item
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id: _templateId, itemId } = await params;
  const body = await request.json();
  const { checklistItemId, checklistText, sortOrder } = body;

  const existing = await prisma.auditChecklistTemplateItem.findUnique({ where: { id: itemId } });
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const item = await prisma.auditChecklistTemplateItem.update({
    where: { id: itemId },
    data: {
      ...(checklistItemId !== undefined ? { checklistItemId } : {}),
      ...(checklistText !== undefined ? { checklistText } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  });

  return NextResponse.json({ item });
}

// DELETE — remove template item
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id: _templateId, itemId } = await params;

  const existing = await prisma.auditChecklistTemplateItem.findUnique({ where: { id: itemId } });
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  await prisma.auditChecklistTemplateItem.delete({ where: { id: itemId } });

  return NextResponse.json({ success: true });
}
