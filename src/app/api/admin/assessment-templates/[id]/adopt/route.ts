import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTENT_WHERE } from "@/lib/content-rollforward";

// POST /api/admin/assessment-templates/[id]/adopt
// Clones a SAMS001 template into a target company, mapping controls
// by ProcessArea name + Control name equivalence
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
      include: {
        controlLinkages: { include: { control: { include: { processArea: { select: { name: true } } } } } },
        activityTypes: true,
      },
    });
    if (!original) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const targetCompany = await prisma.company.findUnique({ where: { id: targetCompanyId } });
    if (!targetCompany) return NextResponse.json({ error: "Target company not found" }, { status: 404 });

    // Fetch all ACTIVE controls at target company with their process areas for mapping
    const targetControls = await prisma.control.findMany({
      where: { ...ACTIVE_CONTENT_WHERE, companyId: targetCompanyId },
      include: { processArea: { select: { name: true } } },
    });

    // Helper: strip company prefix like "[SMDS]" or "[OGP]" from PA names
    const stripPrefix = (name: string) => name.replace(/^\[.*?\]\s*/, "").trim();

    // Build lookup: "stripped-PA-name::Control-name" → controlId
    const targetMap = new Map<string, string>();
    for (const tc of targetControls) {
      const paName = stripPrefix(tc.processArea?.name ?? "");
      const key = `${paName}::${tc.name}`.toLowerCase();
      targetMap.set(key, tc.id);
    }

    // Map each source control to its target equivalent
    const mappedIds: string[] = [];
    let skipped = 0;
    for (const linkage of original.controlLinkages) {
      const srcPA = stripPrefix(linkage.control.processArea?.name ?? "");
      const key = `${srcPA}::${linkage.control.name}`.toLowerCase();
      const targetId = targetMap.get(key);
      if (targetId) {
        mappedIds.push(targetId);
      } else {
        skipped++;
      }
    }

    // Create independent copy under target company with mapped controls
    const cloned = await prisma.assessmentTemplate.create({
      data: {
        name: original.name,
        description: original.description,
        companyId: targetCompany.id,
        controlLinkages: mappedIds.length > 0
          ? { create: mappedIds.map(controlId => ({ controlId })) }
          : undefined,
        activityTypes: {
          create: original.activityTypes.map(a => ({ activityTypeId: a.activityTypeId })),
        },
      },
      include: {
        controlLinkages: { include: { control: { include: { processArea: { select: { name: true } } } } } },
        activityTypes: true,
        _count: { select: { controlLinkages: true } },
      },
    });

    return NextResponse.json({
      ...cloned,
      mappedControls: mappedIds.length,
      skippedControls: skipped,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Adopt failed" }, { status: 500 });
  }
}
