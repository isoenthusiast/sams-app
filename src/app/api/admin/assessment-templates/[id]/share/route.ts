import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/admin/assessment-templates/[id]/share
// Clones a company template to SAMS001, only copying SAMS001-scoped controls
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const original = await prisma.assessmentTemplate.findUnique({
      where: { id },
      include: { controlLinkages: { include: { control: true } }, activityTypes: true },
    });
    if (!original) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    // Find SAMS company
    const samsCompany = await prisma.company.findUnique({ where: { companyID: "SAMS001" } });
    if (!samsCompany) return NextResponse.json({ error: "SAMS001 company not found" }, { status: 500 });

    // Only include controls that are SAMS001-scoped (companyId = SAMS cuid or null)
    const samsControls = original.controlLinkages.filter(
      l => !l.control.companyId || l.control.companyId === samsCompany.id
    );
    const skippedCount = original.controlLinkages.length - samsControls.length;

    // Create independent copy under SAMS001
    const cloned = await prisma.assessmentTemplate.create({
      data: {
        name: `${original.name} (Shared)`,
        description: original.description,
        companyId: samsCompany.id,
        controlLinkages: {
          create: samsControls.map(l => ({ controlId: l.controlId })),
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

    return NextResponse.json({ template: cloned, skippedControls: skippedCount }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Clone failed" }, { status: 500 });
  }
}
