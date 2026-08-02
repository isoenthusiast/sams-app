import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const cookieStore = await cookies();
  const companyId = cookieStore.get("selectedCompanyId")?.value || null;

  const controls = await prisma.control.findMany({
    where: companyId ? { companyId } : {},
    select: {
      id: true,
      name: true,
      controlType: true,
      controlRef: true,
      standard: true,
      processArea: { select: { id: true, name: true } },
      requirementMappings: { select: { requirementRId: true } },
    },
    orderBy: { name: "asc" },
  });

  const mapped = controls.map((c) => ({
    id: c.id,
    name: c.name,
    controlType: c.controlType,
    controlRef: c.controlRef,
    standard: c.standard,
    processAreaId: c.processArea?.id || "",
    processAreaName: c.processArea?.name || "",
    mappedRequirementRIds: c.requirementMappings.map((m) => m.requirementRId),
  }));

  return NextResponse.json({ controls: mapped, total: mapped.length });
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
