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
 *
 * Performance: the copy is BATCHED (createMany / createManyAndReturn) rather
 * than a row-per-query loop. SAMS001 holds ~5,500 rows; a per-row loop over a
 * remote Postgres would take minutes, which is unusable for an operator wizard.
 * `createManyAndReturn` is used where the created ids must be re-linked
 * (standards → process areas → controls); requirements/mappings are batched
 * because their link keys (rId, controlId) are computed/deterministic.
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
  // The copy links content by process-area membership (and control↔requirement
  // by id), so the preview must replicate that linking logic — a naive COUNT of
  // SAMS001 rows would over-count rows whose parent PA isn't copied (a data
  // quirk) and then diverge from the commit's result. Read the id sets once and
  // compute copyable counts in memory.
  const [standards, samsPAs, samsReqs, samsControls, samsMappings] = await Promise.all([
    prisma.standard.count({ where: { companyId: samsCompany.id } }),
    prisma.processArea.findMany({ where: { companyId: samsCompany.id }, select: { id: true } }),
    prisma.requirement.findMany({ where: { companyId: samsCompany.id }, select: { processAreaId: true, rId: true } }),
    prisma.control.findMany({ where: { companyId: samsCompany.id }, select: { processAreaId: true, id: true } }),
    prisma.mapControl2Requirement.findMany({
      where: { control: { companyId: samsCompany.id } },
      select: { controlId: true, requirementRId: true },
    }),
  ]);
  const paIds = new Set(samsPAs.map((p) => p.id));
  const copyableReqs = samsReqs.filter((r) => paIds.has(r.processAreaId ?? ""));
  const reqRids = new Set(copyableReqs.map((r) => r.rId));
  const copyableCtrls = samsControls.filter((c) => paIds.has(c.processAreaId ?? ""));
  const ctrlIds = new Set(copyableCtrls.map((c) => c.id));
  const mappings = samsMappings.filter((m) => ctrlIds.has(m.controlId) && reqRids.has(m.requirementRId));

  return {
    standards,
    processAreas: paIds.size,
    requirements: copyableReqs.length,
    controls: copyableCtrls.length,
    mapControl2Requirement: mappings.length,
  };
}

/**
 * Run the destructive bootstrap: delete the target's existing master data
 * (guarded: only when it has 0 assessments) and copy SAMS001's content down.
 * Returns per-table counts. Batched for speed.
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

  // 2. Copy Standards from SAMS001 (batched; keep standard→id for PA standardId)
  const samsStandards = await prisma.standard.findMany({ where: { companyId: samsCompany.id } });
  const standardIdByName = new Map<string, string>();
  if (samsStandards.length > 0) {
    const created = await prisma.standard.createManyAndReturn({
      data: samsStandards.map((s) => ({
        standard: s.standard,
        sequenceNo: s.sequenceNo,
        companyId: targetCompanyId,
      })),
      select: { id: true, standard: true },
    });
    for (const c of created) standardIdByName.set(c.standard, c.id);
  }
  results.standards = samsStandards.length;

  // 3. Copy ProcessAreas (prefix with company tag, track old→new ID mapping)
  const samsPAs = await prisma.processArea.findMany({
    where: { companyId: samsCompany.id },
    include: { standardRef: true },
  });
  const paIdMap = new Map<string, string>();
  if (samsPAs.length > 0) {
    const created = await prisma.processArea.createManyAndReturn({
      data: samsPAs.map((pa) => ({
        name: `${prefix}${pa.name}`,
        description: pa.description,
        standardId: pa.standardRef?.standard ? standardIdByName.get(pa.standardRef.standard) ?? null : null,
        companyId: targetCompanyId,
      })),
      select: { id: true },
    });
    // createManyAndReturn returns rows in input order (PostgreSQL)
    samsPAs.forEach((pa, i) => paIdMap.set(pa.id, created[i].id));
  }
  results.processAreas = paIdMap.size;

  // 4. Copy Requirements (map to new PA IDs, generate new rIds) — batched
  const samsReqs = await prisma.requirement.findMany({
    where: { companyId: samsCompany.id },
    orderBy: { rId: "asc" },
  });
  const maxRid = await prisma.requirement.aggregate({ _max: { rId: true } });
  let nextRid = (maxRid._max.rId ?? 0) + 1;
  const ridMap = new Map<number, number>(); // old SAMS rId → new target rId
  const reqData: Array<Record<string, unknown>> = [];
  for (const req of samsReqs) {
    const newPAId = paIdMap.get(req.processAreaId ?? "");
    if (!newPAId) continue;
    const newRid = nextRid++;
    reqData.push({
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
    });
    ridMap.set(req.rId, newRid);
  }
  if (reqData.length > 0) await prisma.requirement.createMany({ data: reqData as any });
  results.requirements = reqData.length;

  // 5. Copy Controls (map to new PA IDs) — batched, id-tracked
  const samsControls = await prisma.control.findMany({ where: { companyId: samsCompany.id } });
  const ctlToCreate = samsControls.filter((c) => paIdMap.has(c.processAreaId ?? ""));
  const controlIdMap = new Map<string, string>(); // old SAMS control id → new target id
  if (ctlToCreate.length > 0) {
    const created = await prisma.control.createManyAndReturn({
      data: ctlToCreate.map((c) => ({
        name: c.name,
        statement: c.statement,
        controlType: c.controlType,
        processAreaId: paIdMap.get(c.processAreaId ?? ""),
        companyId: targetCompanyId,
        isHsseCritical: c.isHsseCritical,
        ramRating: c.ramRating,
        riskWeight: c.riskWeight,
        controlRef: c.controlRef,
        csfWho: c.csfWho, csfWhat: c.csfWhat, csfWhen: c.csfWhen,
        csfWhere: c.csfWhere, csfWhy: c.csfWhy, csfHow: c.csfHow,
        csfEvidence: c.csfEvidence,
        keyActivities: c.keyActivities,
        riskAddressed: c.riskAddressed,
        testingApproach: c.testingApproach,
      })),
      select: { id: true },
    });
    ctlToCreate.forEach((c, i) => controlIdMap.set(c.id, created[i].id));
  }
  results.controls = controlIdMap.size;

  // 6. Copy MapControl2Requirement links (map both control and requirement IDs)
  const samsMappings = await prisma.mapControl2Requirement.findMany({
    where: { control: { companyId: samsCompany.id } },
    include: { control: true, requirement: true },
  });
  const mapData: Array<Record<string, unknown>> = [];
  for (const m of samsMappings) {
    const newControlId = controlIdMap.get(m.controlId);
    if (!newControlId) continue;
    const newReqRId = ridMap.get(m.requirementRId);
    if (!newReqRId) continue;
    mapData.push({ controlId: newControlId, requirementRId: newReqRId });
  }
  if (mapData.length > 0) await prisma.mapControl2Requirement.createMany({ data: mapData as any });
  results.mapControl2Requirement = mapData.length;

  return { success: true, results };
}
