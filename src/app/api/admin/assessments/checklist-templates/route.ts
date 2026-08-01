import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";

// GET /api/admin/assessments/checklist-templates
// Returns all available checklist templates for the current company.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const companyId = await getSelectedCompanyId();

  const templates = await prisma.auditChecklistTemplate.findMany({
    where: companyId ? { companyId } : {},
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(templates);
}
