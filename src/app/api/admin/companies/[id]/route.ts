import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — update company
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json();
  const { companyName, shortName, referenceID } = body;

  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const company = await prisma.company.update({
    where: { id },
    data: {
      companyName: companyName?.trim() || existing.companyName,
      shortName: shortName !== undefined ? (shortName?.trim() || null) : existing.shortName,
      referenceID: referenceID !== undefined ? (referenceID?.trim() || null) : existing.referenceID,
    },
  });

  return NextResponse.json({ company });
}

// DELETE — delete company
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;

  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  await prisma.company.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
