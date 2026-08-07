import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { controlIds, requirementRId } = body as { controlIds: string[]; requirementRId: number };

  if (!controlIds?.length || requirementRId == null) {
    return NextResponse.json({ error: "controlIds and requirementRId are required" }, { status: 400 });
  }

  // Verify the requirement exists
  const reqExists = await prisma.requirement.findUnique({ where: { rId: requirementRId } });
  if (!reqExists) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  let created = 0;
  let skipped = 0;

  for (const controlId of controlIds) {
    // Verify control exists
    const ctrl = await prisma.control.findUnique({ where: { id: controlId } });
    if (!ctrl) continue;

    // Check if mapping already exists
    const existing = await prisma.mapControl2Requirement.findFirst({
      where: { controlId, requirementRId },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.mapControl2Requirement.create({
      data: {
        id: `mcr_${controlId}_${requirementRId}`.substring(0, 50),
        controlId,
        requirementRId,
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: controlIds.length });
}
