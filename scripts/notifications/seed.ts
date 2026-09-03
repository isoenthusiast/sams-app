import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * In-App Notifications (SAMS-006) throwaway fixtures. Two companies (A / B), a
 * provider-plane requester, a client requestee, a "foreign" user (for the
 * cross-user mark-read 403 + never-returned scan), a client-B user (cross-company
 * guard), an assessment + finding in each company, and an OVERDUE Action in A
 * (for the computed read-time banner). Idempotent: cleans up its own rows first.
 * DEV/TEST ONLY.
 */
export const NOTIF_IDS = {
  a: "cmp_ntf_a",
  b: "cmp_ntf_b",
  actType: "at_ntf_activity",
  provider: "usr_ntf_provider",
  client: "usr_ntf_client",
  foreign: "usr_ntf_foreign",
  clientB: "usr_ntf_client_b",
  assessmentA: "ass_ntf_a",
  assessmentB: "ass_ntf_b",
  findingA: "FID-NTF-A01",
  findingB: "FID-NTF-B01",
  overdueAction: "act_ntf_overdue",
};

const PASSWORD = "Test1234!";

export async function seedNotificationFixtures() {
  const ids = NOTIF_IDS;
  const users = [ids.provider, ids.client, ids.foreign, ids.clientB];

  // Cleanup (FK-safe: dependents first).
  await prisma.notification.deleteMany({ where: { recipientUserId: { in: users } } });
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
      { id: ids.a, companyID: "NTA001", companyName: "Notification Alpha" },
      { id: ids.b, companyID: "NTA002", companyName: "Notification Beta" },
    ],
  });

  await prisma.assuranceActivityType.create({ data: { id: ids.actType, name: "NTF Remote Audit", defaultLOA: "SecondLine" } });

  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      // Provider-plane requester (holds providerRole AND assessor role).
      { id: ids.provider, name: "NTF Provider", username: "ntf_provider", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a, providerRole: "ProviderAdmin" },
      // Client requestee in company A.
      { id: ids.client, name: "NTF Client", username: "ntf_client", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
      // "Foreign" user in company A — holds a notification the client must never
      // see or mark-read.
      { id: ids.foreign, name: "NTF Foreign", username: "ntf_foreign", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
      // Client in company B (cross-company guard).
      { id: ids.clientB, name: "NTF Client B", username: "ntf_client_b", passwordHash: hash, role: "Assessor", active: true, companyId: ids.b },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "ntf_uc_a", userId: ids.provider, companyId: ids.a },
      { id: "ntf_uc_a2", userId: ids.client, companyId: ids.a },
      { id: "ntf_uc_a3", userId: ids.foreign, companyId: ids.a },
      { id: "ntf_uc_b", userId: ids.clientB, companyId: ids.b },
    ],
  });

  await prisma.assessment.createMany({
    data: [
      { id: ids.assessmentA, activityTypeId: ids.actType, name: "NTF Audit A", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.a },
      { id: ids.assessmentB, activityTypeId: ids.actType, name: "NTF Audit B", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.b },
    ],
  });

  await prisma.finding.createMany({
    data: [
      { id: ids.findingA, assessmentId: ids.assessmentA, description: "NTF Gap A", severity: "Medium" },
      { id: ids.findingB, assessmentId: ids.assessmentB, description: "NTF Gap B", severity: "High" },
    ],
  });

  // Overdue Action in company A (targetDate in the past, closureDate null) — the
  // read-time overdue banner is computed from this, NOT stored as a Notification.
  await prisma.action.create({
    data: {
      id: ids.overdueAction,
      actionId: "NTF-OVR-01",
      findingId: ids.findingA,
      actionDescription: "Close the NTF gap before next audit",
      targetDate: new Date(Date.now() - 86400000 * 3), // 3 days ago
      apAgreed: true,
    },
  });

  // A notification belonging to a DIFFERENT user (foreign) that the session
  // user (client) must never read or mark-read.
  await prisma.notification.create({
    data: {
      recipientUserId: ids.foreign,
      type: "CommentShared",
      entityType: "Finding",
      entityId: ids.findingA,
      title: "Comment shared on a finding",
      body: "This belongs to another user",
      companyId: ids.a,
    },
  });

  return ids;
}

seedNotificationFixtures()
  .then(() => console.log("Notification fixtures seeded."))
  .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
