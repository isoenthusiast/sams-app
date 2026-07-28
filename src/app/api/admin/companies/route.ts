import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — list all companies
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const companies = await prisma.company.findMany({ orderBy: { companyID: "asc" } });
  return NextResponse.json({ companies });
}

// POST — create company
export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  const { companyID, companyName, shortName, referenceID } = body;

  if (!companyID?.trim() || !companyName?.trim()) {
    return NextResponse.json({ error: "companyID and companyName are required" }, { status: 400 });
  }

  const existing = await prisma.company.findUnique({ where: { companyID: companyID.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Company ID already exists" }, { status: 409 });
  }

  const company = await prisma.company.create({
    data: {
      companyID: companyID.trim(),
      companyName: companyName.trim(),
      shortName: shortName?.trim() || null,
      referenceID: referenceID?.trim() || null,
    },
  });

  return NextResponse.json({ company }, { status: 201 });
}
