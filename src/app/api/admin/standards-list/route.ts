import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  const where: Record<string, unknown> = {};
  if (companyId) where.companyId = companyId;

  const standards = await prisma.standard.findMany({
    where,
    select: { id: true, standard: true, sequenceNo: true },
    orderBy: { sequenceNo: "asc" },
  });

  return NextResponse.json({ standards });
}
