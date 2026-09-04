import { prisma } from "@/lib/prisma";

/**
 * Company bootstrap — the single implementation of the "adopt SAMS001 master
 * content into a target company" motion (SAMS-001 → new company).
 *
 * Settled decision (Phase 3a): the Onboarding Wizard REUSES this path as its
 * content-adoption step rather than reimplementing it. Both the legacy
 * `/api/admin/company/[id]/bootstrap` route and the wizard's commit step call
 * `runBootstrap`, so there is exactly one adoption code path.
 *
 * Two entry points:
 *   - `previewBootstrap(targetCompanyId)` — READ-ONLY dry-run: returns the
 *     counts the bootstrap WOULD produce, without deleting or inserting
 *     anything. This is the wizard's per-step "dry-run" panel.
 *   - `runBootstrap(targetCompanyId)` — the destructive copy. Deletes the
 *     target's existing master data (only valid when it has 0 assessments) and
 *     re-inserts everything from SAMS001. Returns per-table result counts.
 */

/** Counts a bootstrap would produce for a fresh target company. */
export type BootstrapPreview = {
  standards: number;
  processAreas: number;
  requirements: number;
  controls: number;
  mapControl2Requirement: number;
};

export type BootstrapResult = {
  success: true;
  results: {
    standards: number;
    processAreas: number;
    requirements: number;
    controls: number;
    mapControl2Requirement: number;
  };
};

/** Find the SAMS001 master company, throwing a typed error if missing. */
async function requireSamsCompany() {
  const samsCompany = await prisma.company.findUnique({ where: { companyID: "SAMS001" } });
  if (!samsCompany) throw new Error("SAMS001 company not found");
  return samsCompany;
}

/** READ-ONLY preview of what bootstrap will produce (no writes). */
export async function previewBootstrap(targetCompanyId: string): Promise<BootstrapPreview> {
  const samsCompany = await requireSamsCompany();
  const [standards, processAreas, requirements, controls, mapControl2Requirement] = await Promise.all([
    prisma.standard.count({ where: { companyId: samsCompany.id } }),
    prisma.processArea.count({ where: { companyId: samsCompany.id } }),
    prisma.requirement.count({ where: { companyId: samsCompany.id } }),
    prisma.control.count({ where: { companyId: samsCompany.id } }),
    prisma.mapControl2Requirement.count({ where: { control: { companyId: samsCompany.id } } }),
  ]);
  return { standards, processAreas, requirements, controls, mapControl2Requirement };
}

/**
 * Run the destructive bootstrap: delete the target's existing master data
 * (guarded: only when it has 0 assessments) and copy SAMS001's content down.
 * Returns per-table counts.
 */
export async function runBootstrap(targetCompanyId: string): Promise<BootstrapResult> {
  const targetCompany = await prisma.company.findUnique({ where: { id: targetCompanyId } });
  if (!targetCompany) throw new Error("Company not found");
  if (targetCompany.companyID === "SAMS001") throw new Error("Cannot bootstrap SAMS001");

  // Guard: only allow if 0 assessments
  const assessmentCount = await prisma.assessment.count({ where: { companyId: targetCompanyId } });
  if (assessmentCount > 0) {
    throw new Error(
      `Cannot bootstrap: ${assessmentCount} assessment(s) exist. Bootstrap only available for new companies.`
    );
  }

  const samsCompany = await requireSamsCompany();
  const prefix = `[${targetCompany.companyID}] `;
  const results: BootstrapResult["results"] = {
    standards: 0,
    processAreas: 0,
    requirements: 0,
    controls: 0,
    mapControl2Requirement: 0,
  };

  // 1. Delete existing master data for target company (dependent order)
  await prisma.mapControl2Requirement.deleteMany({ where: { control: { companyId: targetCompanyId } } });
  await prisma.controlSubProcess.deleteMany({ where: { control: { companyId: targetCompanyId } } });
  await prisma.assessmentTemplateControlLinkage.deleteMany({ where: { control: { companyId: targetCompanyId } } });
  await prisma.control.deleteMany({ where: { companyId: targetCompanyId } });
  await prisma.requirement.deleteMany({ where: { companyId: targetCompanyId } });
  await prisma.processArea.deleteMany({ where: { companyId: targetCompanyId } });
  await prisma.standard.deleteMany({ where: { companyId: targetCompanyId } });

  // 2. Copy Standards from SAMS001
  const samsStandards = await prisma.standard.findMany({ where: { companyId: samsCompany.id } });
  if (samsStandards.length > 0) {
    await prisma.standard.createMany({
      data: samsStandards.map((s) => ({
        standard: s.standard,
        sequenceNo: s.sequenceNo,
        companyId: targetCompanyId,
      })),
      skipDuplicates: true,
    });
  }
  results.standards = samsStandards.length;

  // 3. Copy ProcessAreas (prefix with company tag, track old→new ID mapping)
  const samsPAs = await prisma.processArea.findMany({
    where: { companyId: samsCompany.id },
    include: { standardRef: true },
  });
  const paIdMap = new Map<string, string>();
  for (const pa of samsPAs) {
    const targetStandard = await prisma.standard.findFirst({
      where: { standard: pa.standardRef?.standard ?? "", companyId: targetCompanyId },
    });
    const created = await prisma.processArea.create({
      data: {
        name: `${prefix}${pa.name}`,
        description: pa.description,
        standardId: targetStandard?.id ?? null,
        companyId: targetCompanyId,
      },
    });
    paIdMap.set(pa.id, created.id);
  }
  results.processAreas = paIdMap.size;

  // 4. Copy Requirements (map to new PA IDs, generate new rIds)
  const samsReqs = await prisma.requirement.findMany({
    where: { companyId: samsCompany.id },
    orderBy: { rId: "asc" },
  });
  const maxRid = await prisma.requirement.aggregate({ _max: { rId: true } });
  let nextRid = (maxRid._max.rId ?? 0) + 1;
  const ridMap = new Map<number, number>();
  let reqCount = 0;
  for (const req of samsReqs) {
    const newPAId = paIdMap.get(req.processAreaId ?? "");
    if (!newPAId) continue;
    const newRid = nextRid++;
    await prisma.requirement.create({
      data: {
        rId: newRid,
        requirementId: req.requirementId ?? "",
        clauseContent: req.clauseContent,
        standard: req.standard,
        pId: req.pId,
        intentOutcome: req.intentOutcome,
        clauseApplicability: req.clauseApplicability,
        references: req.references,
        processAreaId: newPAId,
        companyId: targetCompanyId,
      },
    });
    ridMap.set(req.rId, newRid);
    reqCount++;
  }
  results.requirements = reqCount;

  // 5. Copy Controls (map to new PA IDs)
  const samsControls = await prisma.control.findMany({
    where: { companyId: samsCompany.id },
  });
  const controlIdMap = new Map<string, string>();
  let ctrlCount = 0;
  for (const ctrl of samsControls) {
    const newPAId = paIdMap.get(ctrl.processAreaId ?? "");
    if (!newPAId) continue;
    const created = await prisma.control.create({
      data: {
        name: ctrl.name,
        statement: ctrl.statement,
        controlType: ctrl.controlType,
        processAreaId: newPAId,
        companyId: targetCompanyId,
        isHsseCritical: ctrl.isHsseCritical,
        ramRating: ctrl.ramRating,
        riskWeight: ctrl.riskWeight,
        controlRef: ctrl.controlRef,
        csfWho: ctrl.csfWho,
        csfWhat: ctrl.csfWhat,
        csfWhen: ctrl.csfWhen,
        csfWhere: ctrl.csfWhere,
        csfWhy: ctrl.csfWhy,
        csfHow: ctrl.csfHow,
        csfEvidence: ctrl.csfEvidence,
        keyActivities: ctrl.keyActivities,
        riskAddressed: ctrl.riskAddressed,
        testingApproach: ctrl.testingApproach,
      },
    });
    controlIdMap.set(ctrl.id, created.id);
    ctrlCount++;
  }
  results.controls = ctrlCount;

  // 6. Copy MapControl2Requirement links (map both control and requirement IDs)
  const samsMappings = await prisma.mapControl2Requirement.findMany({
    where: { control: { companyId: samsCompany.id } },
    include: { control: true, requirement: true },
  });
  let mapCount = 0;
  for (const m of samsMappings) {
    const newControlId = controlIdMap.get(m.controlId);
    if (!newControlId) continue;
    const newReqRId = ridMap.get(m.requirementRId);
    if (!newReqRId) continue;
    await prisma.mapControl2Requirement.create({
      data: { controlId: newControlId, requirementRId: newReqRId },
    });
    mapCount++;
  }
  results.mapControl2Requirement = mapCount;

  return { success: true, results };
}
