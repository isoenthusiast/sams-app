import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";

// GET /api/admin/assessments/checklist-templates
// Returns available checklist templates: company-specific + SAMS001 shared.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const companyId = await getSelectedCompanyId();

  // Resolve SAMS001 master company ID for shared templates
  const samsCompany = await prisma.company.findFirst({ where: { companyID: "SAMS001" }, select: { id: true } });
  const samsId = samsCompany?.id;

  const templates = await prisma.auditChecklistTemplate.findMany({
    where: companyId
      ? { OR: [{ companyId }, ...(samsId && companyId !== samsId ? [{ companyId: samsId }] : [])] }
      : {},
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });

  // Tag each template as global (SAMS001) or local
  const result = templates.map((t) => ({
    ...t,
    isGlobal: t.companyId === samsId,
  }));

  return NextResponse.json(result);
}
