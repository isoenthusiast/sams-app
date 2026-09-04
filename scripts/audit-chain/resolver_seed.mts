import { prisma } from "@/lib/prisma";
import { canonicalizeRow, computeChainHash } from "@/lib/audit-chain";

/**
 * SAMS-015b — resolver + append-only backfill fixtures (DEV/TEST ONLY, throwaway DB).
 *
 * Sets up ONE anchored company `comp_res_a` with a PRE-EXISTING 3-row chain
 * (Assessment rows, hashes computed via the SAME canonicalizeRow + computeChainHash
 * the writer/backfill/verifier use), then inserts the three formerly-unresolvable
 * refTable ActivityLog rows with companyId NULL so the migration must backfill them:
 *   - append_mc    → MapControl2Requirement → control(companyId=A)   → appends AFTER tail
 *   - at_a_row     → AssessmentTemplate(companyId=A)                 → appends AFTER tail
 *   - append_sample→ Sample → assessment(A)                          → appends AFTER tail
 *   - mid_sample   → Sample → assessment(A), but createdAt falls BETWEEN pre_1 and
 *                    pre_2 (BEFORE tail) → MUST be reset to chainless to avoid rewrite
 *   - null_mc      → MapControl2Requirement → control(companyId=null) → stays chainless
 *   - null_at      → AssessmentTemplate(companyId=null)               → stays chainless
 *   - null_sample  → Sample → assessment(companyId=null)              → stays chainless
 */
export const RES = {
  companyA: "comp_res_a",
  ctrlA: "ctrl_res_a",
  ctrlNull: "ctrl_res_null",
  mcA: "mc_res_a",
  mcNull: "mc_res_null",
  atA: "at_res_a",
  atNull: "at_res_null",
  assA: "ass_res_a",
  assNull: "ass_res_null",
  sampleA: "sample_res_a",
  sampleNull: "sample_res_null",
  activityType: "at_res_a",
  user: "usr_res_a",
};

async function cleanup() {
  const logIds = [
    "pre_1", "pre_2", "pre_3",
    "append_mc", "at_a_row", "append_sample",
    "mid_sample", "null_mc", "null_at", "null_sample",
  ];
  await prisma.activityLog.deleteMany({ where: { id: { in: logIds } } });
  await prisma.sample.deleteMany({ where: { id: { in: [RES.sampleA, RES.sampleNull] } } });
  await prisma.assessmentTemplate.deleteMany({ where: { id: { in: [RES.atA, RES.atNull] } } });
  await prisma.mapControl2Requirement.deleteMany({ where: { id: { in: [RES.mcA, RES.mcNull] } } });
  await prisma.control.deleteMany({ where: { id: { in: [RES.ctrlA, RES.ctrlNull] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [RES.assA, RES.assNull] } } });
  await prisma.requirement.deleteMany({ where: { rId: { in: [1, 2] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: RES.activityType } });
  await prisma.user.deleteMany({ where: { id: RES.user } });
  await prisma.company.deleteMany({ where: { id: RES.companyA } });
}

export async function seedResolverFixtures() {
  await cleanup();

  // Domain bootstrap (FK parents).
  await prisma.company.create({ data: { id: RES.companyA, companyID: "RESA", companyName: "Resolver Alpha" } });
  await prisma.assuranceActivityType.create({ data: { id: RES.activityType, name: "Res AT", defaultLOA: "SecondLine" } });
  await prisma.user.create({ data: { id: RES.user, name: "Res User", username: "res_user", passwordHash: "x", role: "Assessor", active: true } });
  await prisma.requirement.createMany({ data: [
    { rId: 1, standard: "std", pId: "p1", requirementId: "r1", clauseContent: "c1", intentOutcome: "i1", clauseApplicability: "a1" },
    { rId: 2, standard: "std", pId: "p2", requirementId: "r2", clauseContent: "c2", intentOutcome: "i2", clauseApplicability: "a2" },
  ]});

  await prisma.control.createMany({ data: [
    { id: RES.ctrlA, name: "Ctrl A", statement: "s", controlType: "Procedural", companyId: RES.companyA },
    { id: RES.ctrlNull, name: "Ctrl Global", statement: "s", controlType: "Procedural", companyId: null },
  ]});

  await prisma.mapControl2Requirement.createMany({ data: [
    { id: RES.mcA, controlId: RES.ctrlA, requirementRId: 1 },
    { id: RES.mcNull, controlId: RES.ctrlNull, requirementRId: 2 },
  ]});

  await prisma.assessmentTemplate.createMany({ data: [
    { id: RES.atA, name: "AT A", companyId: RES.companyA },
    { id: RES.atNull, name: "AT Null", companyId: null },
  ]});

  await prisma.assessment.createMany({ data: [
    { id: RES.assA, activityTypeId: RES.activityType, name: "Ass A", assessorId: RES.user, startDate: new Date("2026-01-01"), loa: "SecondLine", status: "InProgress", companyId: RES.companyA },
    { id: RES.assNull, activityTypeId: RES.activityType, name: "Ass Null", assessorId: RES.user, startDate: new Date("2026-01-01"), loa: "SecondLine", status: "InProgress", companyId: null },
  ]});

  await prisma.sample.createMany({ data: [
    { id: RES.sampleA, assessmentId: RES.assA },
    { id: RES.sampleNull, assessmentId: RES.assNull },
  ]});

  // ── PRE-EXISTING chain for comp_res_a (Assessment rows, hashes computed). ──
  const preRows = [
    { id: "pre_1", refTable: "Assessment", refRecord: RES.assA, createdAt: new Date("2026-06-01T00:00:00Z") },
    { id: "pre_2", refTable: "Assessment", refRecord: RES.assA, createdAt: new Date("2026-06-02T00:00:00Z") },
    { id: "pre_3", refTable: "Assessment", refRecord: RES.assA, createdAt: new Date("2026-06-03T00:00:00Z") }, // tail
  ];
  let prev = "";
  for (const r of preRows) {
    const canonical = canonicalizeRow({
      id: r.id, timestamp: r.createdAt, description: `Pre ${r.id}`, activityType: "ASSESSMENT_CREATED",
      username: "provider", refTable: r.refTable, refRecord: r.refRecord, beforeData: null, afterData: null,
      companyId: RES.companyA,
    });
    const chainHash = computeChainHash(prev, canonical);
    await prisma.activityLog.create({ data: { id: r.id, timestamp: r.createdAt, createdAt: r.createdAt, description: `Pre ${r.id}`, activityType: "ASSESSMENT_CREATED", username: "provider", refTable: r.refTable, refRecord: r.refRecord, companyId: RES.companyA, chainHash } });
    prev = chainHash;
  }

  // ── Rows to be backfilled (companyId NULL). ──
  const mkNew = (
    id: string, createdAt: string, refTable: string, refRecord: string | null,
  ) => ({ id, timestamp: new Date(createdAt), createdAt: new Date(createdAt),
    activityType: "SAMS015B_PROBE", description: `backfill ${id}`, username: "provider",
    refTable, refRecord, companyId: null, chainHash: null } as const);

  await prisma.activityLog.createMany({ data: [
    mkNew("append_mc", "2026-06-10T00:00:00Z", "MapControl2Requirement", RES.mcA),
    mkNew("at_a_row", "2026-06-12T00:00:00Z", "AssessmentTemplate", RES.atA),
    mkNew("append_sample", "2026-06-15T00:00:00Z", "Sample", RES.sampleA),
    mkNew("mid_sample", "2026-06-02T12:00:00Z", "Sample", RES.sampleA), // BETWEEN pre_1 & pre_2 → mid-chain
    mkNew("null_mc", "2026-06-11T00:00:00Z", "MapControl2Requirement", RES.mcNull),
    mkNew("null_at", "2026-06-13T00:00:00Z", "AssessmentTemplate", RES.atNull),
    mkNew("null_sample", "2026-06-16T00:00:00Z", "Sample", RES.sampleNull),
  ]});

  return RES;
}

if (process.argv[1] && process.argv[1].endsWith("resolver_seed.mts")) {
  seedResolverFixtures()
    .then(() => console.log("SAMS-015b resolver fixtures seeded."))
    .catch((e) => { console.error("resolver seed failed:", e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
