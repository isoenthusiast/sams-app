import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const controls = await prisma.control.findMany({ include: { processArea: { select: { name: true } } }, orderBy: { name: "asc" } });
  return NextResponse.json({ controls });
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await request.json();
  const { name, statement, controlType, processAreaId, companyId } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const ctrl = await prisma.control.create({
    data: { name: name.trim(), statement: statement?.trim() || "", controlType: controlType || "Administrative", processAreaId: processAreaId || null, companyId: companyId || null },
    include: { processArea: { select: { name: true } } },
  });
  return NextResponse.json({ control: ctrl }, { status: 201 });
}
