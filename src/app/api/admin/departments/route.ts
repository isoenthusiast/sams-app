import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — list departments for a company
export async function GET(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  const where = companyId ? { companyId } : {};
  const departments = await prisma.department.findMany({ where, orderBy: { name: "asc" } });
  return NextResponse.json({ departments });
}

// POST — create department
export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json();
  const { name } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Get the first company (default to SMDS)
  const company = await prisma.company.findFirst({ where: { companyID: "SMDS" } });
  if (!company) {
    return NextResponse.json({ error: "No default company found" }, { status: 500 });
  }

  const department = await prisma.department.create({
    data: { name: name.trim(), companyId: company.id },
  });

  return NextResponse.json({ department }, { status: 201 });
}
