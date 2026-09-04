import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * SAMS-010 white-label theming — throwaway fixtures.
 *
 * Two portal companies (WL-A = "Whitelabel Alpha", WL-B = "Whitelabel Beta"),
 * each with a client Admin + a client Assessor. The ADMIN_A is the only user
 * with role Admin belonging to A; ADMIN_B belongs to B. Also a client Assessor
 * (ASSESSOR_A) who must NOT be able to write theme (other role → 403), and a
 * client Admin A who must NOT be able to theme company B (cross-tenant write →
 * 403 by construction). Idempotent: cleans up its own rows first.
 *
 * DEV/TEST ONLY — never the real SAMS001 / SMDS / OGP companies.
 */
export const WL_IDS = {
  a: "cmp_wl_a",
  b: "cmp_wl_b",
  adminA: "usr_wl_admin_a",
  adminB: "usr_wl_admin_b",
  adminMulti: "usr_wl_admin_multi",
  assessorA: "usr_wl_ass_a",
  actType: "at_wl_activity",
  paA: "pa_wl_a",
  paB: "pa_wl_b",
  standardA: "std_wl_a",
  standardB: "std_wl_b",
  reqA: 7201,
  reqB: 7202,
  assessmentA: "ass_wl_a",
  assessmentB: "ass_wl_b",
  findingA: "FID-WL-A01",
  findingB: "FID-WL-B01",
};

const PASSWORD = "Test1234!";

async function cleanUp() {
  const ids = WL_IDS;
  await prisma.userCompany.deleteMany({ where: { userId: { in: [ids.adminA, ids.adminB, ids.adminMulti, ids.assessorA] } } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA, ids.findingB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assessmentA, ids.assessmentB] } } });
  await prisma.requirement.deleteMany({ where: { rId: { in: [ids.reqA, ids.reqB] } } });
  await prisma.processArea.deleteMany({ where: { id: { in: [ids.paA, ids.paB] } } });
  await prisma.standard.deleteMany({ where: { id: { in: [ids.standardA, ids.standardB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.adminA, ids.adminB, ids.adminMulti, ids.assessorA] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.actType } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
}

export async function seedWhitelabel(): Promise<void> {
  await cleanUp();

  await prisma.company.createMany({
    data: [
      { id: WL_IDS.a, companyID: "WL001", companyName: "Whitelabel Alpha" },
      { id: WL_IDS.b, companyID: "WL002", companyName: "Whitelabel Beta" },
    ],
  });

  await prisma.assuranceActivityType.create({ data: { id: WL_IDS.actType, name: "WL Remote Audit", defaultLOA: "SecondLine" } });
  await prisma.standard.createMany({
    data: [
      { id: WL_IDS.standardA, standard: "ISO-9001-WL", companyId: WL_IDS.a },
      { id: WL_IDS.standardB, standard: "ISO-14001-WL", companyId: WL_IDS.b },
    ],
  });
  await prisma.processArea.createMany({
    data: [
      { id: WL_IDS.paA, name: "WL Process A", companyId: WL_IDS.a },
      { id: WL_IDS.paB, name: "WL Process B", companyId: WL_IDS.b },
    ],
  });
  await prisma.requirement.createMany({
    data: [
      { rId: WL_IDS.reqA, standard: "ISO-9001-WL", pId: "WL-A", requirementId: "WL-REQ-A", clauseContent: "A", intentOutcome: "A", clauseApplicability: "yes", companyId: WL_IDS.a, socStatus: "FullyComply", socSummary: "A" },
      { rId: WL_IDS.reqB, standard: "ISO-14001-WL", pId: "WL-B", requirementId: "WL-REQ-B", clauseContent: "B", intentOutcome: "B", clauseApplicability: "yes", companyId: WL_IDS.b, socStatus: "NotComply", socSummary: "B" },
    ],
  });

  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      // Client Admin A — owns WL001.
      { id: WL_IDS.adminA, name: "WLA Admin", username: "wl_admin_a", passwordHash: hash, role: "Admin", active: true, companyId: WL_IDS.a },
      // Client Admin B — owns WL002.
      { id: WL_IDS.adminB, name: "WLB Admin", username: "wl_admin_b", passwordHash: hash, role: "Admin", active: true, companyId: WL_IDS.b },
      // Client Admin MULTI — home = WL-A, ALSO mapped to WL-B via UserCompany
      // (Conan round-1 finding #1): exercises the multi-company portal where the
      // header must resolve the ACTIVE company server-side, never a companies[0]
      // fallback, and never leak A's theme onto B's page.
      { id: WL_IDS.adminMulti, name: "WLM Multi Admin", username: "wl_admin_multi", passwordHash: hash, role: "Admin", active: true, companyId: WL_IDS.a },
      // Client Assessor A — NOT Admin; must be 403 on theme write.
      { id: WL_IDS.assessorA, name: "WLA Assessor", username: "wl_ass_a", passwordHash: hash, role: "Assessor", active: true, companyId: WL_IDS.a },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "uc_wl_admin_a", userId: WL_IDS.adminA, companyId: WL_IDS.a },
      { id: "uc_wl_admin_b", userId: WL_IDS.adminB, companyId: WL_IDS.b },
      { id: "uc_wl_admin_multi_b", userId: WL_IDS.adminMulti, companyId: WL_IDS.b },
      { id: "uc_wl_ass_a", userId: WL_IDS.assessorA, companyId: WL_IDS.a },
    ],
  });

  await prisma.assessment.createMany({
    data: [
      { id: WL_IDS.assessmentA, activityTypeId: WL_IDS.actType, name: "WL Audit A", assessorId: WL_IDS.adminA, startDate: new Date(), loa: "SecondLine", companyId: WL_IDS.a },
      { id: WL_IDS.assessmentB, activityTypeId: WL_IDS.actType, name: "WL Audit B", assessorId: WL_IDS.adminB, startDate: new Date(), loa: "SecondLine", companyId: WL_IDS.b },
    ],
  });
  await prisma.finding.createMany({
    data: [
      { id: WL_IDS.findingA, assessmentId: WL_IDS.assessmentA, description: "WL Gap A", severity: "Medium", requirementRId: WL_IDS.reqA },
      { id: WL_IDS.findingB, assessmentId: WL_IDS.assessmentB, description: "WL Gap B", severity: "High", requirementRId: WL_IDS.reqB },
    ],
  });
}

seedWhitelabel()
  .catch((e) => {
    console.error("SAMS-010 seed errored:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

