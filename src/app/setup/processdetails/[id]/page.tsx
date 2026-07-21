import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import ProcessDetailsClient from "./ProcessDetailsClient";

export const dynamic = "force-dynamic";

export default async function ProcessDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const currentUserName = session?.user?.name ?? null;
  const currentUserRole = (session?.user as any)?.role ?? null;
  const companyId = await getSelectedCompanyId();

  const processArea = await prisma.processArea.findUnique({
    where: { id, ...(companyId ? { companyId } : {}) },
    include: { _count: { select: { subProcesses: true, controls: true } } },
  });

  if (!processArea) notFound();

  // Sub-processes with controls
  const subProcesses = await prisma.subProcess.findMany({
    where: { processAreaId: id },
    orderBy: { name: "asc" },
    include: {
      controlSubProcesses: {
        include: {
          control: { include: { _count: { select: { controlAssignments: true } } } },
        },
      },
    },
  });

  const mergedSubProcesses = subProcesses.map((sp) => ({
    ...sp,
    controls: sp.controlSubProcesses
      .map((csp) => csp.control)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  // Requirements with their controls
  const requirementsWithControls = await prisma.requirement.findMany({
    where: { processAreaId: id },
    include: {
      controlMappings: {
        include: {
          control: { include: { _count: { select: { controlAssignments: true } } } },
        },
      },
    },
  });

  const reqWithControls = [...requirementsWithControls]
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId, undefined, { numeric: true }))
    .map((req) => ({
      rId: req.rId,
      requirementId: req.requirementId,
      clauseContent: req.clauseContent,
      controls: req.controlMappings
        .map((m) => m.control)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));

  // Assessments
  const spControlIds = mergedSubProcesses.flatMap((sp) => sp.controls.map((c) => c.id));
  const controlAssignments = spControlIds.length > 0
    ? await prisma.controlAssignment.findMany({
        where: { controlId: { in: spControlIds } },
        select: { assessmentId: true, effective: true, controlId: true },
      })
    : [];

  const assessmentIds = [...new Set(controlAssignments.map((ca) => ca.assessmentId))];
  const assessments = assessmentIds.length > 0
    ? await prisma.assessment.findMany({
        where: { id: { in: assessmentIds } },
        orderBy: { startDate: "desc" },
        include: {
          activityType: true,
          assessor: true,
          samples: true,
          findings: { include: { _count: { select: { actions: true } } } },
        },
      })
    : [];

  // KB entries
  const kbEntries = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "kID", "knowledgeName", "knowledgeContent", "remarks", "createdDate", "addedBy"
     FROM "Knowledgebase"
     WHERE "processAreaId" = $1
     ORDER BY "createdDate" DESC`,
    id
  );

  return (
    <ProcessDetailsClient
      processArea={processArea}
      subProcesses={mergedSubProcesses}
      assessments={assessments}
      reqWithControls={reqWithControls}
      allControls={mergedSubProcesses.flatMap((sp) => sp.controls)}
      currentUserName={currentUserName}
      currentUserRole={currentUserRole}
      companyId={companyId}
      kbEntries={kbEntries.map((e) => ({
        kID: e.kID,
        knowledgeName: e.knowledgeName,
        knowledgeContent: e.knowledgeContent,
        remarks: e.remarks,
        createdDate: e.createdDate instanceof Date ? e.createdDate.toISOString() : String(e.createdDate),
        addedBy: e.addedBy,
      }))}
    />
  );
}
