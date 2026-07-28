import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  const body = await request.json();
  const { name, description, standardId } = body;
  const pa = await prisma.processArea.update({ where: { id }, data: { name: name?.trim(), description: description?.trim() ?? undefined, standardId: standardId ?? undefined }, include: { standardRef: true } });
  return NextResponse.json({ processArea: pa });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  await prisma.processArea.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
