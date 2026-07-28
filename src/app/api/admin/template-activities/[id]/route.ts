import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — sync template activity type linkages
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json();
  const { activityTypeIds } = body; // string[]

  // Delete existing linkages
  await prisma.assessmentTemplateActivityType.deleteMany({ where: { templateId: id } });

  // Re-insert selected
  if (activityTypeIds && activityTypeIds.length > 0) {
    for (const atId of activityTypeIds) {
      await prisma.assessmentTemplateActivityType.create({
        data: { templateId: id, activityTypeId: atId },
      });
    }
  }

  return NextResponse.json({ success: true });
}
