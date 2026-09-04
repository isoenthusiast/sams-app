import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTENT_WHERE } from "@/lib/content-rollforward";
import { NextResponse } from "next/server";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const pas = await prisma.processArea.findMany({ where: ACTIVE_CONTENT_WHERE, include: { standardRef: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ processAreas: pas });
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await request.json();
  const { name, description, standardId, companyId } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const pa = await prisma.processArea.create({ data: { name: name.trim(), description: description?.trim() || null, standardId: standardId || null, companyId: companyId || null }, include: { standardRef: true } });
  return NextResponse.json({ processArea: pa }, { status: 201 });
}
