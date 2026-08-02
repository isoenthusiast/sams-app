import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";

// GET /api/admin/assessments/[id]/controls
// Returns company-scoped controls with requirement mappings for the
// Control Assignment tab. Loaded on-demand to avoid serializing
// 70k+ mappings into the assessment page's RSC payload.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  // Verify assessment exists + user has access
  const companyId = await getSelectedCompanyId();
  const assessment = await prisma.assessment.findUnique({
    where: { id, ...(companyId ? { companyId } : {}) },
    select: { id: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const controls = await prisma.control.findMany({
    where: companyId ? { companyId } : {},
    include: {
      processArea: { include: { standardRef: true } },
      requirementMappings: { include: { requirement: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(JSON.parse(JSON.stringify(controls)));
}
