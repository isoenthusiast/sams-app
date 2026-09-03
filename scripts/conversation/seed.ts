import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Conversation Fabric (SAMS-004) throwaway fixtures.
 * Two companies (A / B), a provider-plane user, two client users, an assessment
 * + finding in each company. Idempotent: cleans up its own rows first.
 * DEV/TEST ONLY — never the real SAMS001 / SMDS / OGP companies.
 */
export const CF_IDS = {
  a: "cmp_cf_a",
  b: "cmp_cf_b",
  actType: "at_cf_activity",
  provider: "usr_cf_provider",
  client: "usr_cf_client",
  client2: "usr_cf_client2",
  clientB: "usr_cf_client_b",
  assessmentA: "ass_cf_a",
  assessmentB: "ass_cf_b",
  findingA: "FID-CF-A01",
  findingB: "FID-CF-B01",
};

const PASSWORD = "Test1234!";

export async function seedConversationFixtures() {
  const ids = CF_IDS;
  const users = [ids.provider, ids.client, ids.client2, ids.clientB];

  // Cleanup (FK-safe: dependents first)
  await prisma.comment.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.evidenceRequest.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.attachmentMapping.deleteMany({ where: { destTable: "EvidenceRequest" } });
  await prisma.action.deleteMany({ where: { findingId: { in: [ids.findingA, ids.findingB] } } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA, ids.findingB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assessmentA, ids.assessmentB] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.actType } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });

  await prisma.company.createMany({
    data: [
      { id: ids.a, companyID: "CFA001", companyName: "Conversation Fabric Alpha" },
      { id: ids.b, companyID: "CFB002", companyName: "Conversation Fabric Beta" },
    ],
  });

  await prisma.assuranceActivityType.create({ data: { id: ids.actType, name: "CF Remote Audit", defaultLOA: "SecondLine" } });

  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      // Provider-plane: holds providerRole (ProviderAdmin) AND assessor role.
      { id: ids.provider, name: "CF Provider", username: "cf_provider", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a, providerRole: "ProviderAdmin" },
      // Client user (requestee) in company A.
      { id: ids.client, name: "CF Client", username: "cf_client", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
      // Another client user in company A (for "requestee GET other's request" 403).
      { id: ids.client2, name: "CF Client Two", username: "cf_client2", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
      // Client user in company B (for the cross-company requestee → 400 guard).
      { id: ids.clientB, name: "CF Client B", username: "cf_client_b", passwordHash: hash, role: "Assessor", active: true, companyId: ids.b },
    ],
  });
  // UserCompany mappings so non-admin users pass hasCompanyAccess inside company A.
  await prisma.userCompany.createMany({
    data: [
      { id: "uc_cf_a", userId: ids.provider, companyId: ids.a },
      { id: "uc_cf_b", userId: ids.provider, companyId: ids.b },
      { id: "uc_cf_client", userId: ids.client, companyId: ids.a },
      { id: "uc_cf_client2", userId: ids.client2, companyId: ids.a },
      { id: "uc_cf_client_b", userId: ids.clientB, companyId: ids.b },
    ],
  });

  await prisma.assessment.createMany({
    data: [
      { id: ids.assessmentA, activityTypeId: ids.actType, name: "CF Audit A", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.a },
      { id: ids.assessmentB, activityTypeId: ids.actType, name: "CF Audit B", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.b },
    ],
  });

  await prisma.finding.createMany({
    data: [
      { id: ids.findingA, assessmentId: ids.assessmentA, description: "CF Gap A", severity: "Medium" },
      { id: ids.findingB, assessmentId: ids.assessmentB, description: "CF Gap B", severity: "High" },
    ],
  });

  return ids;
}

seedConversationFixtures()
  .then(() => console.log("Conversation Fabric fixtures seeded."))
  .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
