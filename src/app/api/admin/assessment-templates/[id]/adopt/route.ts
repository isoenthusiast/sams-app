import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/admin/assessment-templates/[id]/adopt
// Clones a SAMS001 template into a target company
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { targetCompanyId } = body;
    if (!targetCompanyId) return NextResponse.json({ error: "targetCompanyId required" }, { status: 400 });

    const original = await prisma.assessmentTemplate.findUnique({
      where: { id },
      include: { controlLinkages: true, activityTypes: true },
    });
    if (!original) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const targetCompany = await prisma.company.findUnique({ where: { id: targetCompanyId } });
    if (!targetCompany) return NextResponse.json({ error: "Target company not found" }, { status: 404 });

    // Create independent copy under target company
    const cloned = await prisma.assessmentTemplate.create({
      data: {
        name: `${original.name}`,
        description: original.description,
        companyId: targetCompany.id,
        controlLinkages: {
          create: original.controlLinkages.map(l => ({ controlId: l.controlId })),
        },
        activityTypes: {
          create: original.activityTypes.map(a => ({ activityTypeId: a.activityTypeId })),
        },
      },
      include: {
        controlLinkages: { include: { control: true } },
        activityTypes: true,
        _count: { select: { controlLinkages: true } },
      },
    });

    return NextResponse.json(cloned, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Adopt failed" }, { status: 500 });
  }
}
