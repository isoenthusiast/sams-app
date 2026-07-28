import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  const body = await request.json();
  const { standard, standardDescription, sequenceNo } = body;
  const s = await prisma.standard.update({ where: { id }, data: { standard: standard?.trim(), standardDescription: standardDescription?.trim() ?? undefined, sequenceNo: sequenceNo ?? undefined } });
  return NextResponse.json({ standard: s });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  await prisma.standard.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
