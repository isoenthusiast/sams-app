import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { auth } from "@/auth";
import { getPaAttestationStatus } from "@/lib/mic-attestations";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ProcessDetailsClient from "./ProcessDetailsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const pa = await prisma.processArea.findUnique({
      where: { id },
      select: { name: true },
    });
    if (pa?.name) return { title: pa.name };
  } catch {
    // fall through to default title
  }
  return { title: "Process Area" };
}

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

  // MIC Ritual (SAMS-014): derived attestation state for this PA (chip + modal).
  // The PA's own companyId is the source of truth (not the session cookie), so the
  // card renders correctly even on a bare (no-company-cookie) load.
  let attestationStatus: Awaited<ReturnType<typeof getPaAttestationStatus>> = null;
  try {
    attestationStatus = await getPaAttestationStatus(id, processArea.companyId);
  } catch {
    attestationStatus = null;
  }

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

  // All PA controls = direct links (SMDS controls are linked directly, not via sub-processes)
  // plus any legacy sub-process-linked controls.
  const paControls = await prisma.control.findMany({
    where: { processAreaId: id },
    select: {
      id: true, name: true, rawHealthScore: true, isHsseCritical: true,
      _count: { select: { controlAssignments: true } },
    },
  });
  const allControlsFlat = Array.from(
    new Map(
      [...paControls, ...mergedSubProcesses.flatMap((sp) => sp.controls)].map((c) => [c.id, c])
    ).values()
  );

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
      socStatus: req.socStatus,
      socSummary: req.socSummary,
      controls: req.controlMappings
        .map((m) => ({ ...m.control, mandatory: m.mandatory, mcrId: m.id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));

  // Assessments — direct PA link first (v1.13.2+), then legacy control-assignment chain
  const assessmentInclude = {
    activityType: true,
    assessor: true,
    samples: true,
    findings: { include: { _count: { select: { actions: true } } } },
  };
  const directAssessments = await prisma.assessment.findMany({
    where: { processAreaId: id },
    include: assessmentInclude,
  });

  const controlIds = allControlsFlat.map((c) => c.id);
  const controlAssignments = controlIds.length > 0
    ? await prisma.controlAssignment.findMany({
        where: { controlId: { in: controlIds } },
        select: { assessmentId: true, effective: true, controlId: true },
      })
    : [];
  const legacyAssessmentIds = [...new Set(controlAssignments.map((ca) => ca.assessmentId))];
  const legacyAssessments = legacyAssessmentIds.length > 0
    ? await prisma.assessment.findMany({
        where: { id: { in: legacyAssessmentIds }, processAreaId: null },
        include: assessmentInclude,
      })
    : [];

  const assessments = [...directAssessments, ...legacyAssessments]
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  // KB entries
  const kbEntries = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "kID", "knowledgeName", "knowledgeContent", "remarks", "createdDate", "addedBy"
     FROM "Knowledgebase"
     WHERE "processAreaId" = $1
     AND "entryType" = 'Knowledge'
     ORDER BY "createdDate" DESC`,
    id
  );

  // PIP items for this PA
  const pipItems = await prisma.backlogItem.findMany({
    where: { isPIP: true, processAreaId: id },
    orderBy: { createdAt: "desc" },
    include: {
      controlLinks: { include: { control: { select: { id: true, name: true } } } },
    },
  });

  // ── Assessment Actions (auto-synced to Kanban) ──
  // Find actions linked to this PA via Finding → Assessment → ControlAssignment → Control
  const assessmentActions = allControlsFlat.length > 0 ? await prisma.$queryRawUnsafe<Array<{
    id: string; actionId: string; "actionDescription": string; "actionParty": string;
    "targetDate": string; "apAgreed": boolean; "closureDate": string | null;
    findingId: string; "findingDescription": string;
    assessmentId: string; "assessmentName": string;
    controlId: string; "controlName": string;
  }>>(
    `SELECT
       a.id, a."actionId", a."actionDescription", a."actionParty",
       a."targetDate"::text, a."apAgreed", a."closureDate"::text,
       f.id as "findingId", f.description as "findingDescription",
       ass.id as "assessmentId", ass.name as "assessmentName",
       c.id as "controlId", c.name as "controlName"
     FROM "Action" a
     JOIN "Finding" f ON f.id = a."findingId"
     JOIN "Assessment" ass ON ass.id = f."assessmentId"
     JOIN "ControlAssignment" ca ON ca."assessmentId" = ass.id
     JOIN "Control" c ON c.id = ca."controlId"
     LEFT JOIN "ControlSubProcess" csp ON csp."controlId" = ca."controlId"
     WHERE (c."processAreaId" = $1
        OR csp."subProcessId" IN (SELECT id FROM "SubProcess" WHERE "processAreaId" = $1))
       AND a."apAgreed" = true
     ORDER BY a."closureDate" NULLS FIRST, a."targetDate" ASC`,
    id
  ) : [];

  // ── Health Metrics for ORCA Overview ──
  const healthDistribution = { effective: 0, partiallyEffective: 0, ineffective: 0, neverTested: 0 };
  for (const c of allControlsFlat) {
    const assignments = (c as any)._count?.controlAssignments ?? 0;
    const score = (c as any).rawHealthScore;
    if (assignments === 0 || score == null || score === 0) healthDistribution.neverTested++;
    else if (score >= 80) healthDistribution.effective++;
    else if (score >= 50) healthDistribution.partiallyEffective++;
    else healthDistribution.ineffective++;
  }
  const testedCount = allControlsFlat.length - healthDistribution.neverTested;
  const avgHealth = testedCount > 0
    ? Math.round(allControlsFlat.reduce((s, c) => s + ((c as any).rawHealthScore || 0), 0) / testedCount)
    : null;

  // ── Requirements Coverage (SOC distribution) ──
  const requirementCoverage = { fully: 0, partially: 0, not: 0, unset: 0 };
  for (const r of reqWithControls as any[]) {
    if (r.socStatus === "FullyComply") requirementCoverage.fully++;
    else if (r.socStatus === "PartiallyComply") requirementCoverage.partially++;
    else if (r.socStatus === "NotComply") requirementCoverage.not++;
    else requirementCoverage.unset++;
  }

  // Findings & actions summary
  const openFindings = assessments.flatMap(a => a.findings || []).filter((f: any) => f.status !== 'Closed');
  const allActions = openFindings.flatMap((f: any) => f.actions || []);
  const overdueActions = allActions.filter((a: any) => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'Closed');

  // Last assessment
  const lastAssessment = assessments.length > 0 ? assessments[0] : null;

  // ── Process Documents (Documents tab) ──
  // Shared = SAMS001 company's documents (applies to all companies).
  // companyId columns store Company.id (cuid), so resolve the master company's id first.
  const masterCompany = await prisma.company.findUnique({
    where: { companyID: "SAMS001" },
    select: { id: true },
  });
  const masterId = masterCompany?.id ?? "SAMS001";
  const paDocuments = await prisma.document.findMany({
    where: {
      processAreaId: id,
      archivedAt: null,
      OR: [
        { companyId: masterId },
        ...(companyId && companyId !== masterId ? [{ companyId }] : []),
      ],
    },
    select: {
      id: true, filename: true, summary: true, source: true, folder: true,
      companyId: true, processAreaId: true, createdAt: true,
      documentContent: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const healthMetrics = {
    totalControls: allControlsFlat.length,
    healthDistribution,
    avgHealth,
    openFindings: openFindings.length,
    overdueActions: overdueActions.length,
    totalAssessments: assessments.length,
    lastAssessment: lastAssessment ? {
      id: lastAssessment.id,
      startDate: lastAssessment.startDate.toISOString(),
      assessorName: (lastAssessment as any).assessor?.name || null,
      name: (lastAssessment as any).name || (lastAssessment as any).assessmentName || null,
    } : null,
  };

  return (
    <ProcessDetailsClient
      processArea={processArea}
      subProcesses={mergedSubProcesses}
      assessments={assessments}
      reqWithControls={reqWithControls}
      allControls={allControlsFlat}
      healthMetrics={healthMetrics}
      requirementCoverage={requirementCoverage}
      pipItems={JSON.parse(JSON.stringify(pipItems))}
      assessmentActions={JSON.parse(JSON.stringify(assessmentActions))}
      currentUserName={currentUserName}
      currentUserRole={currentUserRole}
      companyId={companyId}
      masterCompanyId={masterId}
      attestationStatus={attestationStatus}
      documents={JSON.parse(JSON.stringify(paDocuments))}
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
