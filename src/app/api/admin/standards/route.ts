import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTENT_WHERE } from "@/lib/content-rollforward";
import { NextResponse } from "next/server";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const standards = await prisma.standard.findMany({ where: ACTIVE_CONTENT_WHERE, orderBy: { standard: "asc" } });
  return NextResponse.json({ standards });
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await request.json();
  const { standard, standardDescription, sequenceNo, companyId } = body;
  if (!standard?.trim()) return NextResponse.json({ error: "standard is required" }, { status: 400 });
  const s = await prisma.standard.create({
    data: { standard: standard.trim(), standardDescription: standardDescription?.trim() || null, sequenceNo: sequenceNo ?? 0, companyId: companyId || null },
  });
  return NextResponse.json({ standard: s }, { status: 201 });
}
