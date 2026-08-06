import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";

// GET /api/admin/assessments/[id]/controls
// ?mode=available — returns controls NOT yet assigned to this assessment
// default — returns all company controls
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");

  const companyId = await getSelectedCompanyId();
  const assessment = await prisma.assessment.findUnique({
    where: { id, ...(companyId ? { companyId } : {}) },
    select: { id: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  if (mode === "available") {
    // Return controls NOT yet assigned to this assessment
    const assignedIds = await prisma.controlAssignment.findMany({
      where: { assessmentId: id },
      select: { controlId: true },
    });
    const excludeIds = assignedIds.map(a => a.controlId);

    const controls = await prisma.control.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        id: { notIn: excludeIds.length > 0 ? excludeIds : ["__none__"] },
      },
      include: {
        processArea: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(JSON.parse(JSON.stringify(controls)));
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

// POST /api/admin/assessments/[id]/controls — assign controls in bulk
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { controlIds } = body as { controlIds: string[] };

  if (!controlIds?.length) {
    return NextResponse.json({ error: "controlIds required" }, { status: 400 });
  }

  const companyId = await getSelectedCompanyId();
  const assessment = await prisma.assessment.findUnique({
    where: { id, ...(companyId ? { companyId } : {}) },
    select: { id: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  let created = 0;
  for (const cid of controlIds) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ControlAssignment" (id, "assessmentId", "controlId", "createdAt")
         VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
        `ca_${id.slice(-8)}_${cid.slice(-8)}_${Date.now()}_${created}`,
        id,
        cid,
      );
      created++;
    } catch { /* skip duplicates */ }
  }

  return NextResponse.json({ created, requested: controlIds.length });
}
