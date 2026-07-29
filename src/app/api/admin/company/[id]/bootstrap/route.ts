import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/admin/company/[id]/bootstrap
// Bootstraps a company with SAMS001 master data (Standards → PAs → Requirements → Controls → MapControl2Requirement)
// Only allowed when company has 0 assessments (destructive: deletes existing master data, re-inserts from SAMS001)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetCompanyId } = await params;
  try {
    // Verify target company exists and is not SAMS001
    const targetCompany = await prisma.company.findUnique({ where: { id: targetCompanyId } });
    if (!targetCompany) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    if (targetCompany.companyID === "SAMS001") return NextResponse.json({ error: "Cannot bootstrap SAMS001" }, { status: 400 });

    // Guard: only allow if 0 assessments
    const assessmentCount = await prisma.assessment.count({ where: { companyId: targetCompanyId } });
    if (assessmentCount > 0) {
      return NextResponse.json({ error: `Cannot bootstrap: ${assessmentCount} assessment(s) exist. Bootstrap only available for new companies.` }, { status: 400 });
    }

    // Find SAMS company
    const samsCompany = await prisma.company.findUnique({ where: { companyID: "SAMS001" } });
    if (!samsCompany) return NextResponse.json({ error: "SAMS001 company not found" }, { status: 500 });

    const prefix = `[${targetCompany.companyID}] `;
    const results: Record<string, number> = {};

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
        data: samsStandards.map(s => ({ standard: s.standard, sequenceNo: s.sequenceNo, companyId: targetCompanyId })),
        skipDuplicates: true,
      });
    }
    results.standards = samsStandards.length;

    // 3. Copy ProcessAreas (prefix with company tag, track old→new ID mapping)
    const samsPAs = await prisma.processArea.findMany({
      where: { companyId: samsCompany.id },
      include: { standardRef: true },
    });
    const paIdMap = new Map<string, string>(); // old SAMS PA id → new target PA id
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
    // Find next available rId (max across entire table + 1)
    const maxRid = await prisma.requirement.aggregate({ _max: { rId: true } });
    let nextRid = (maxRid._max.rId ?? 0) + 1;
    const ridMap = new Map<number, number>(); // old SAMS rId → new target rId
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
    const controlIdMap = new Map<string, string>(); // old SAMS control id → new target control id
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
          csfWho: ctrl.csfWho, csfWhat: ctrl.csfWhat, csfWhen: ctrl.csfWhen,
          csfWhere: ctrl.csfWhere, csfWhy: ctrl.csfWhy, csfHow: ctrl.csfHow,
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
      // Find the equivalent requirement in target company by the old rId mapping
      const newReqRId = ridMap.get(m.requirementRId);
      if (!newReqRId) continue;
      await prisma.mapControl2Requirement.create({
        data: { controlId: newControlId, requirementRId: newReqRId },
      });
      mapCount++;
    }
    results.mapControl2Requirement = mapCount;

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Bootstrap failed" }, { status: 500 });
  }
}
