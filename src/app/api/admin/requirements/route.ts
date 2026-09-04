import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTENT_WHERE } from "@/lib/content-rollforward";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const standard = searchParams.get("standard") || undefined;
  const processAreaId = searchParams.get("processAreaId") || undefined;
  const companyId = searchParams.get("companyId") || undefined;
  const search = searchParams.get("search") || undefined;

  const where: Record<string, unknown> = { ...ACTIVE_CONTENT_WHERE };
  if (standard) where.standard = standard;
  if (processAreaId) where.processAreaId = processAreaId;
  if (companyId) where.companyId = companyId;
  if (search) {
    where.OR = [
      { clauseContent: { contains: search, mode: "insensitive" } },
      { requirementId: { contains: search, mode: "insensitive" } },
    ];
  }

  const requirements = await prisma.requirement.findMany({
    where,
    include: {
      processArea: { select: { name: true } },
      _count: { select: { controlMappings: true } },
    },
    orderBy: { requirementId: "asc" },
    take: 200,
  });

  const data = requirements.map((r) => ({
    rId: r.rId,
    requirementId: r.requirementId,
    clauseContent: r.clauseContent,
    intentOutcome: r.intentOutcome,
    processAreaId: r.processAreaId,
    processAreaName: r.processArea?.name ?? null,
    standard: r.standard,
    pId: r.pId,
    companyId: r.companyId,
    mappedControlCount: r._count.controlMappings,
  }));

  return NextResponse.json({ requirements: data });
}
