import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, description, companyId, controlIds } = body;

    // Update template metadata
    const updated = await prisma.assessmentTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(companyId !== undefined && { companyId }),
      },
      include: { controlLinkages: { include: { control: true } } },
    });

    // If controlIds provided, bulk-replace linkages
    if (controlIds !== undefined) {
      // Delete existing linkages
      await prisma.assessmentTemplateControlLinkage.deleteMany({ where: { templateId: id } });
      // Create new linkages
      if (controlIds.length > 0) {
        await prisma.assessmentTemplateControlLinkage.createMany({
          data: controlIds.map((controlId: string) => ({ templateId: id, controlId })),
          skipDuplicates: true,
        });
      }
      // Re-fetch with updated linkages
      const withControls = await prisma.assessmentTemplate.findUnique({
        where: { id },
        include: { controlLinkages: { include: { control: true } } },
      });
      return NextResponse.json(withControls);
    }

    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Update failed" }, { status: 500 });
  }
}
