import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * SAMS-011 public read-only API — throwaway fixtures.
 *
 * Two companies (PA-A = "Public Alpha", PA-B = "Public Beta") with DELIBERATELY
 * DISTINCTIVE marker strings so the cross-tenant scan (DoD b) can prove a
 * company-A key returns ZERO company-B identifiers:
 *   - A: companyID "PUB001", companyName "Public Alpha", finding desc starts
 *        "ALPHA-ONLY-FINDING", process area "Alpha Process".
 *   - B: companyID "PUB002", companyName "Public Beta", finding desc starts
 *        "BETA-ONLY-FINDING", process area "Beta Process".
 * Each company has 1 requirement (SOC status distinct), 1 assessment, 1 finding,
 * and actions with a deliberate overdue/non-overdue split. Two client Admins:
 * pa_admin_a (A only) and pa_admin_b (B only).
 *
 * Idempotent: cleans up its own rows first (including any ApiKey rows left by a
 * prior test run). DEV/TEST ONLY — never the real SAMS001 / SMDS / OGP companies.
 */
export const PA_IDS = {
  a: "cmp_pa_a",
  b: "cmp_pa_b",
  actType: "at_pa_activity",
  adminA: "usr_pa_admin_a",
  adminB: "usr_pa_admin_b",
  standardA: "std_pa_a",
  standardB: "std_pa_b",
  paA: "pa_pa_a",
  paB: "pa_pa_b",
  reqA: 8101,
  reqB: 8102,
  assA: "ass_pa_a",
  assB: "ass_pa_b",
  findingA: "FID-PA-A01",
  findingB: "FID-PA-B01",
  actionA1: "act_pa_a1",
  actionA2: "act_pa_a2",
  actionB1: "act_pa_b1",
};

export const PA_MARKERS = {
  aCompanyID: "PUB001",
  bCompanyID: "PUB002",
  aCompanyName: "Public Alpha",
  bCompanyName: "Public Beta",
  aFinding: "ALPHA-ONLY-FINDING",
  bFinding: "BETA-ONLY-FINDING",
  aPA: "Alpha Process",
  bPA: "Beta Process",
};

const PASSWORD = "Test1234!";
const now = Date.now();
const future = new Date(now + 30 * 24 * 60 * 60 * 1000); // +30 days
const past = new Date(now - 10 * 24 * 60 * 60 * 1000); // -10 days (overdue)

async function cleanUp() {
  const ids = PA_IDS;
  await prisma.apiKey.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.action.deleteMany({ where: { id: { in: [ids.actionA1, ids.actionA2, ids.actionB1] } } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA, ids.findingB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assA, ids.assB] } } });
  await prisma.requirement.deleteMany({ where: { rId: { in: [ids.reqA, ids.reqB] } } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: [ids.adminA, ids.adminB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.adminA, ids.adminB] } } });
  await prisma.processArea.deleteMany({ where: { id: { in: [ids.paA, ids.paB] } } });
  await prisma.standard.deleteMany({ where: { id: { in: [ids.standardA, ids.standardB] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.actType } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
}

export async function seedPublicApi(): Promise<void> {
  await cleanUp();
  const ids = PA_IDS;

  await prisma.company.createMany({
    data: [
      { id: ids.a, companyID: PA_MARKERS.aCompanyID, companyName: PA_MARKERS.aCompanyName },
      { id: ids.b, companyID: PA_MARKERS.bCompanyID, companyName: PA_MARKERS.bCompanyName },
    ],
  });
  await prisma.assuranceActivityType.create({ data: { id: ids.actType, name: "PA Remote Audit", defaultLOA: "SecondLine" } });

  await prisma.standard.createMany({
    data: [
      { id: ids.standardA, standard: "ISO-PA-ALPHA", companyId: ids.a },
      { id: ids.standardB, standard: "ISO-PA-BETA", companyId: ids.b },
    ],
  });
  await prisma.processArea.createMany({
    data: [
      { id: ids.paA, name: PA_MARKERS.aPA, companyId: ids.a, standardId: ids.standardA },
      { id: ids.paB, name: PA_MARKERS.bPA, companyId: ids.b, standardId: ids.standardB },
    ],
  });
  await prisma.requirement.createMany({
    data: [
      { rId: ids.reqA, standard: "ISO-PA-ALPHA", pId: "PA-A", requirementId: "REQ-ALPHA-01", clauseContent: "A", intentOutcome: "A", clauseApplicability: "yes", companyId: ids.a, processAreaId: ids.paA, socStatus: "FullyComply", socSummary: "Alpha fully complies" },
      { rId: ids.reqB, standard: "ISO-PA-BETA", pId: "PA-B", requirementId: "REQ-BETA-01", clauseContent: "B", intentOutcome: "B", clauseApplicability: "yes", companyId: ids.b, processAreaId: ids.paB, socStatus: "NotComply", socSummary: "Beta does not comply" },
    ],
  });

  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      { id: ids.adminA, name: "PA Admin A", username: "pa_admin_a", passwordHash: hash, role: "Admin", active: true, companyId: ids.a },
      { id: ids.adminB, name: "PA Admin B", username: "pa_admin_b", passwordHash: hash, role: "Admin", active: true, companyId: ids.b },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "uc_pa_admin_a", userId: ids.adminA, companyId: ids.a },
      { id: "uc_pa_admin_b", userId: ids.adminB, companyId: ids.b },
    ],
  });

  await prisma.assessment.createMany({
    data: [
      { id: ids.assA, activityTypeId: ids.actType, name: "Alpha Audit", assessorId: ids.adminA, startDate: new Date(), loa: "SecondLine", companyId: ids.a },
      { id: ids.assB, activityTypeId: ids.actType, name: "Beta Audit", assessorId: ids.adminB, startDate: new Date(), loa: "SecondLine", companyId: ids.b },
    ],
  });
  await prisma.finding.createMany({
    data: [
      { id: ids.findingA, assessmentId: ids.assA, description: `${PA_MARKERS.aFinding}: control gap delta`, severity: "High", requirementRId: ids.reqA },
      { id: ids.findingB, assessmentId: ids.assB, description: `${PA_MARKERS.bFinding}: remediation required`, severity: "Medium", requirementRId: ids.reqB },
    ],
  });
  await prisma.action.createMany({
    data: [
      { id: ids.actionA1, findingId: ids.findingA, actionId: "ACT-ALPHA-1", actionDescription: "Alpha action open (future)", targetDate: future },
      { id: ids.actionA2, findingId: ids.findingA, actionId: "ACT-ALPHA-2", actionDescription: "Alpha action OVERDUE", targetDate: past },
      { id: ids.actionB1, findingId: ids.findingB, actionId: "ACT-BETA-1", actionDescription: "Beta action open (future)", targetDate: future },
    ],
  });
}

// Run directly (seed public-api fixtures).
if (process.argv.includes("--run")) {
  seedPublicApi()
    .catch((e) => {
      console.error("SAMS-011 seed errored:", e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
