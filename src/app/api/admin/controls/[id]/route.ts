import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  const body = await request.json();
  const { name, statement, controlType, processAreaId } = body;
  const ctrl = await prisma.control.update({ where: { id }, data: { name: name?.trim(), statement: statement?.trim() ?? undefined, controlType: controlType ?? undefined, processAreaId: processAreaId ?? undefined }, include: { processArea: { select: { name: true } } } });
  return NextResponse.json({ control: ctrl });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  await prisma.control.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
