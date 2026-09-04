import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Outbound Notifications (SAMS-009, Phase 3a Feature B) throwaway fixtures.
 *
 * Two companies (A / B), each with a webhook URL pointing at the local test
 * receiver (port 3999, `/nh_a` and `/nh_b` paths — so cross-tenant safety is
 * observable: company-A events must land ONLY in `/nh_a`, never `/nh_b`). A
 * provider-side requester, a client requestee, a client-ADMIN in each company
 * (sweep in-app recipients + settings card), assessments + findings in each, one
 * DRAFT evidence request (the test drives send→webhook), and one Action overdue
 * WITHIN the last 24h (the sweep window) for company A. Idempotent: cleans up its
 * own rows first. DEV/TEST ONLY.
 *
 * CRON_SECRET is read from the env (the functional test sets it on the server).
 */
export const OUT_IDS = {
  a: "cmp_out_a",
  b: "cmp_out_b",
  actType: "at_out_audit",
  provider: "usr_out_provider",
  client: "usr_out_client",
  adminA: "usr_out_admin_a",
  adminB: "usr_out_admin_b",
  assessmentA: "ass_out_a",
  assessmentB: "ass_out_b",
  findingA: "FID-OUT-A01",
  findingB: "FID-OUT-B01",
  overdueAction: "act_out_overdue",
  draftRequest: "er_out_draft",
};

const PASSWORD = "Test1234!";
// Local webhook receiver paths — set per company so cross-tenant is observable.
export const WEBHOOK_URL_A = "http://127.0.0.1:3999/nh_a";
export const WEBHOOK_URL_B = "http://127.0.0.1:3999/nh_b";

export async function seedOutboundFixtures() {
  const ids = OUT_IDS;
  const users = [ids.provider, ids.client, ids.adminA, ids.adminB];

  // Cleanup (FK-safe: dependents first).
  await prisma.notificationDelivery.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.notification.deleteMany({ where: { recipientUserId: { in: users } } });
  await prisma.evidenceRequest.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.action.deleteMany({ where: { findingId: { in: [ids.findingA, ids.findingB] } } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA, ids.findingB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assessmentA, ids.assessmentB] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.actType } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });

  await prisma.company.createMany({
    data: [
      { id: ids.a, companyID: "OUT001", companyName: "Outbound Alpha", notificationWebhookUrl: WEBHOOK_URL_A },
      { id: ids.b, companyID: "OUT002", companyName: "Outbound Beta", notificationWebhookUrl: WEBHOOK_URL_B },
    ],
  });

  await prisma.assuranceActivityType.create({ data: { id: ids.actType, name: "OUT Remote Audit", defaultLOA: "SecondLine" } });

  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      // Provider-side requester (provider-plane AND assignable assessor role).
      { id: ids.provider, name: "OUT Provider", username: "out_provider", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a, providerRole: "ProviderAdmin" },
      // Client requestee in company A.
      { id: ids.client, name: "OUT Client", username: "out_client", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
      // Client-ADMIN in company A (sweep in-app recipient + settings card).
      { id: ids.adminA, name: "OUT Admin A", username: "out_admin_a", passwordHash: hash, role: "Admin", active: true, companyId: ids.a },
      // Client-ADMIN in company B.
      { id: ids.adminB, name: "OUT Admin B", username: "out_admin_b", passwordHash: hash, role: "Admin", active: true, companyId: ids.b },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "out_uc_prov", userId: ids.provider, companyId: ids.a },
      { id: "out_uc_cli", userId: ids.client, companyId: ids.a },
      { id: "out_uc_admA", userId: ids.adminA, companyId: ids.a },
      { id: "out_uc_admB", userId: ids.adminB, companyId: ids.b },
    ],
  });

  await prisma.assessment.createMany({
    data: [
      { id: ids.assessmentA, activityTypeId: ids.actType, name: "OUT Audit A", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.a },
      { id: ids.assessmentB, activityTypeId: ids.actType, name: "OUT Audit B", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.b },
    ],
  });

  await prisma.finding.createMany({
    data: [
      { id: ids.findingA, assessmentId: ids.assessmentA, description: "OUT Gap A", severity: "Medium" },
      { id: ids.findingB, assessmentId: ids.assessmentB, description: "OUT Gap B", severity: "High" },
    ],
  });

  // An Action overdue WITHIN the last 24h (the sweep window) in company A.
  await prisma.action.create({
    data: {
      id: ids.overdueAction,
      actionId: "OUT-OVR-01",
      findingId: ids.findingA,
      actionDescription: "Close the OUT gap before the next audit",
      targetDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago → newly overdue
      apAgreed: true,
    },
  });

  // A DRAFT evidence request (the test drives send → webhook).
  await prisma.evidenceRequest.create({
    data: {
      id: ids.draftRequest,
      companyId: ids.a,
      assessmentId: ids.assessmentA,
      title: "Provide OUT sign-off memo",
      instructions: "Attach the client sign-off memo.",
      requestedByUserId: ids.provider,
      requestedFromUserId: ids.client,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "Draft",
    },
  });

  return ids;
}

seedOutboundFixtures()
  .then(() => console.log("Outbound fixtures seeded."))
  .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
