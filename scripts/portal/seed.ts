import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Client Portal (SAMS-005) throwaway fixtures.
 * Two companies (A / B), one provider-plane user, a client Assessor + client
 * Interviewee in company A, a client Assessor in company B, one assessment +
 * finding + action + requirement in each company. Idempotent: cleans up its own
 * rows first. DEV/TEST ONLY — never the real SAMS001 / SMDS / OGP companies.
 */
export const PF_IDS = {
  a: "cmp_pf_a",
  b: "cmp_pf_b",
  actType: "at_pf_activity",
  paA: "pa_pf_a",
  paB: "pa_pf_b",
  provider: "usr_pf_provider",
  clientA: "usr_pf_client_a",
  intervieweeA: "usr_pf_interview_a",
  clientB: "usr_pf_client_b",
  noCompany: "usr_pf_nocompany",
  assessmentA: "ass_pf_a",
  assessmentB: "ass_pf_b",
  findingA: "FID-PF-A01",
  findingB: "FID-PF-B01",
  actionA: "act_pf_a",
  actionB: "act_pf_b",
  reqA: 7101,
  reqB: 7102,
};

const PASSWORD = "Test1234!";

export async function seedPortalFixtures() {
  const ids = PF_IDS;
  const users = [ids.provider, ids.clientA, ids.intervieweeA, ids.clientB, ids.noCompany];

  // Cleanup (FK-safe: dependents first).
  await prisma.comment.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.evidenceRequest.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.attachmentMapping.deleteMany({ where: { destTable: "EvidenceRequest" } });
  await prisma.action.deleteMany({ where: { id: { in: [ids.actionA, ids.actionB] } } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA, ids.findingB] } } });
  await prisma.requirement.deleteMany({ where: { rId: { in: [ids.reqA, ids.reqB] } } });
  await prisma.processArea.deleteMany({ where: { id: { in: [ids.paA, ids.paB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assessmentA, ids.assessmentB] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.actType } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });

  await prisma.company.createMany({
    data: [
      { id: ids.a, companyID: "PFA001", companyName: "Portal Alpha" },
      { id: ids.b, companyID: "PFB002", companyName: "Portal Beta" },
    ],
  });

  await prisma.assuranceActivityType.create({ data: { id: ids.actType, name: "PF Remote Audit", defaultLOA: "SecondLine" } });

  await prisma.processArea.createMany({
    data: [
      { id: ids.paA, name: "Portal PA A", companyId: ids.a },
      { id: ids.paB, name: "Portal PA B", companyId: ids.b },
    ],
  });

  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      { id: ids.provider, name: "PF Provider", username: "pf_provider", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a, providerRole: "ProviderAdmin" },
      { id: ids.clientA, name: "PF Client A", username: "pf_client_a", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
      { id: ids.intervieweeA, name: "PF Interviewee A", username: "pf_interviewee_a", passwordHash: hash, role: "Interviewee", active: true, companyId: ids.a },
      { id: ids.clientB, name: "PF Client B", username: "pf_client_b", passwordHash: hash, role: "Assessor", active: true, companyId: ids.b },
      { id: ids.noCompany, name: "PF No Company", username: "pf_nocompany", passwordHash: hash, role: "Assessor", active: true },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "uc_pf_provider", userId: ids.provider, companyId: ids.a },
      { id: "uc_pf_provider_b", userId: ids.provider, companyId: ids.b },
      { id: "uc_pf_client_a", userId: ids.clientA, companyId: ids.a },
      { id: "uc_pf_interview_a", userId: ids.intervieweeA, companyId: ids.a },
      { id: "uc_pf_client_b", userId: ids.clientB, companyId: ids.b },
    ],
  });

  await prisma.requirement.createMany({
    data: [
      { rId: ids.reqA, standard: "ISO-9001-PF", pId: "PFA-1", requirementId: "PFA-REQ-A", clauseContent: "PF A", intentOutcome: "PF A", clauseApplicability: "yes", companyId: ids.a, processAreaId: ids.paA, applicable: true, socStatus: "FullyComply", socSummary: "PF A" },
      { rId: ids.reqB, standard: "ISO-14001-PF", pId: "PFB-2", requirementId: "PFB-REQ-B", clauseContent: "PF B", intentOutcome: "PF B", clauseApplicability: "yes", companyId: ids.b, processAreaId: ids.paB, applicable: true, socStatus: "NotComply", socSummary: "PF B" },
    ],
  });

  await prisma.assessment.createMany({
    data: [
      { id: ids.assessmentA, activityTypeId: ids.actType, name: "PF Audit A", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.a },
      { id: ids.assessmentB, activityTypeId: ids.actType, name: "PF Audit B", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.b },
    ],
  });

  await prisma.finding.createMany({
    data: [
      { id: ids.findingA, assessmentId: ids.assessmentA, description: "PF Gap A", severity: "Medium", requirementRId: ids.reqA, riskDescription: "PF A risk", rootCause: "PF A root", recommendation: "PF A rec" },
      { id: ids.findingB, assessmentId: ids.assessmentB, description: "PF Gap B", severity: "High", requirementRId: ids.reqB, riskDescription: "PF B risk", rootCause: "PF B root", recommendation: "PF B rec" },
    ],
  });

  // Action A is overdue (targetDate in the past); action B is in the future.
  await prisma.action.createMany({
    data: [
      { id: ids.actionA, findingId: ids.findingA, actionDescription: "Fix A", targetDate: new Date(Date.now() - 86400000), auditee: "PF Client A" },
      { id: ids.actionB, findingId: ids.findingB, actionDescription: "Fix B", targetDate: new Date(Date.now() + 86400000), auditee: "PF Client B" },
    ],
  });

  // An evidence request addressed to clientA (company A) for the requests page.
  await prisma.evidenceRequest.create({
    data: {
      id: "er_pf_a1",
      companyId: ids.a,
      assessmentId: ids.assessmentA,
      title: "Provide PF A sign-off",
      instructions: "Please provide the client sign-off memo.",
      requestedByUserId: ids.provider,
      requestedFromUserId: ids.clientA,
      dueDate: new Date(Date.now() + 7 * 86400000),
      status: "Requested",
    },
  });

  // Comments on finding A: client-authored (visible to both), provider-Internal
  // (MUST be invisible to the portal), and provider-Shared.
  await prisma.comment.createMany({
    data: [
      { id: "cm_pf_a_client", entityType: "Finding", entityId: ids.findingA, authorUserId: ids.clientA, authorPlane: "Client", visibility: "SharedWithClient", body: "PF A client comment", companyId: ids.a },
      { id: "cm_pf_a_internal", entityType: "Finding", entityId: ids.findingA, authorUserId: ids.provider, authorPlane: "Provider", visibility: "Internal", body: "PF A INTERNAL-ONLY note", companyId: ids.a },
      { id: "cm_pf_a_shared", entityType: "Finding", entityId: ids.findingA, authorUserId: ids.provider, authorPlane: "Provider", visibility: "SharedWithClient", body: "PF A provider shared note", companyId: ids.a },
    ],
  });

  return ids;
}

seedPortalFixtures()
  .then(() => console.log("Client Portal fixtures seeded."))
  .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
