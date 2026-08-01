import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getSelectedCompanyId } from "@/lib/authz";

// POST — create a new checklist template
export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const companyId = await getSelectedCompanyId();
  const body = await request.json();
  const { name, description, auditStandard } = body;

  if (!name || !auditStandard) {
    return NextResponse.json({ error: "name and auditStandard are required" }, { status: 400 });
  }

  const template = await prisma.auditChecklistTemplate.create({
    data: {
      name,
      description: description || null,
      auditStandard,
      companyId: companyId || undefined,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
