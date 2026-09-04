import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTENT_WHERE } from "@/lib/content-rollforward";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  const where: Record<string, unknown> = { ...ACTIVE_CONTENT_WHERE };
  if (companyId) where.companyId = companyId;

  const standards = await prisma.standard.findMany({
    where,
    select: { id: true, standard: true, sequenceNo: true },
    orderBy: { sequenceNo: "asc" },
  });

  return NextResponse.json({ standards });
}
