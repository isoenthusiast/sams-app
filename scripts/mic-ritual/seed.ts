import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * MIC Ritual (SAMS-014, Phase 4 Feature B) throwaway fixtures.
 *
 * Two companies (A / B), each with a webhook URL pointing at the local test
 * receiver (port 3999, `/nh_a` and `/nh_b` paths — so cross-tenant safety is
 * observable: company-A events must land ONLY in `/nh_a`, never `/nh_b`).
 *
 * Company A (`cmp_mic_a`, MIC001, webhook /nh_a) — `createdAt` set 200 days in the
 * past so its process areas are DERIVED **overdue** (nextDue = createdAt + 90d is
 * far past). Two PAs:
 *   - `pa_mic_a1` (overdue) — the digest/notify/surfaces PROBE (never attested
 *     in the tests where it must stay overdue).
 *   - `pa_mic_a2` (overdue) — the ATTEST TARGET with a known server snapshot
 *     (3 requirements: 1 FullyComply / 1 PartiallyComply / 1 NotComply →
 *     coveragePct 33; 1 open finding; 1 overdue action → findingCount 1,
 *     overdueActionCount 1).
 *
 * Company B (`cmp_mic_b`, MIC002, webhook /nh_b) — `createdAt` set 25 days ago so
 * its single PA (`pa_mic_b1`) is DERIVED **attested** at the quarterly default
 * (nextDue = 25d ago + 90d = 65d future) and is the CADENCE-CHANGE probe (it
 * flips attested↔dueSoon as the per-company cadence moves, recomputing
 * immediately). It never has an overdue PA, so the digest line for B is always
 * ": 0".
 *
 * Users (password Test1234!): a provider-plane Assessor (company A), a client
 * Admin A, a client Assessor A, + no company-B SPO (the digest/B cadence tests
 * drive the provider plane or the webhook directly). A cross-tenant prober is the
 * client Assessor A (company A ONLY) — attempting to attest `pa_mic_b1` must 403.
 *
 * Idempotent: cleans up its own rows first. DEV/TEST ONLY.
 */
export const MIC_IDS = {
  a: "cmp_mic_a",
  b: "cmp_mic_b",
  atType: "at_mic_audit",
  provider: "usr_mic_provider",
  adminA: "usr_mic_admin_a",
  assessorA: "usr_mic_assessor_a",
  paA1: "pa_mic_a1",
  paA2: "pa_mic_a2",
  paB: "pa_mic_b1",
  assA1: "ass_mic_a1",
  assA2: "ass_mic_a2",
  findingA1: "FID-MIC-A01",
  findingA2: "FID-MIC-A02",
  actionA1: "act_mic_a1",
  actionA2: "act_mic_a2",
} as const;

const PASSWORD = "Test1234!";
export const WEBHOOK_URL_A = "http://127.0.0.1:3999/nh_a";
export const WEBHOOK_URL_B = "http://127.0.0.1:3999/nh_b";

const DAY = 24 * 60 * 60 * 1000;

export async function seedMicFixtures() {
  const ids = MIC_IDS;
  const users = [ids.provider, ids.adminA, ids.assessorA];

  // Cleanup (FK-safe: dependents first).
  await prisma.micAttestation.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  // Clear MIC audit rows (append-only ActivityLog) so verify counts are deterministic
  // per run. The throwaway DB only ever creates MIC_* rows from this fixture.
  await prisma.activityLog.deleteMany({ where: { activityType: { in: ["MIC_ATTEST", "MIC_CADENCE_CHANGE"] } } });
  await prisma.notificationDelivery.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.notification.deleteMany({ where: { recipientUserId: { in: users } } });
  await prisma.action.deleteMany({ where: { findingId: { in: [ids.findingA1, ids.findingA2] } } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA1, ids.findingA2] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assA1, ids.assA2] } } });
  await prisma.requirement.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.processArea.deleteMany({ where: { companyId: { in: [ids.a, ids.b] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.atType } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });

  // Companies. Company A createdAt = 200d ago (PA baseline overdue); B = 25d ago
  // (PA baseline attested at 90d; responsive to cadence changes).
  await prisma.company.createMany({
    data: [
      { id: ids.a, companyID: "MIC001", companyName: "MIC Alpha", notificationWebhookUrl: WEBHOOK_URL_A, createdAt: new Date(Date.now() - 200 * DAY) },
      { id: ids.b, companyID: "MIC002", companyName: "MIC Beta", notificationWebhookUrl: WEBHOOK_URL_B, createdAt: new Date(Date.now() - 25 * DAY) },
    ],
  });

  await prisma.assuranceActivityType.create({ data: { id: ids.atType, name: "MIC Remote Audit", defaultLOA: "SecondLine" } });

  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      { id: ids.provider, name: "MIC Provider", username: "mic_provider", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a, providerRole: "ProviderAdmin" },
      { id: ids.adminA, name: "MIC Admin A", username: "mic_admin_a", passwordHash: hash, role: "Admin", active: true, companyId: ids.a },
      { id: ids.assessorA, name: "MIC Assessor A", username: "mic_assessor_a", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "mic_uc_prov", userId: ids.provider, companyId: ids.a },
      { id: "mic_uc_admA", userId: ids.adminA, companyId: ids.a },
      { id: "mic_uc_assA", userId: ids.assessorA, companyId: ids.a },
    ],
  });

  // Process areas.
  await prisma.processArea.createMany({
    data: [
      { id: ids.paA1, name: "MIC PA Alpha - Governance", companyId: ids.a, standard: "ISO 9001" },
      { id: ids.paA2, name: "MIC PA Alpha - Operations", companyId: ids.a, standard: "ISO 14001" },
      { id: ids.paB, name: "MIC PA Beta - Risk", companyId: ids.b, standard: "ISO 31000" },
    ],
  });

  // Requirements for paA2 (the attest-target snapshot): 1 Fully + 1 Partial + 1 Not.
  await prisma.requirement.createMany({
    data: [
      { rId: 910001, standard: "ISO 14001", pId: "P1", processAreaId: ids.paA2, requirementId: "MIC-REQ-1", clauseContent: "Environmental policy clause", intentOutcome: "Policy", clauseApplicability: "All", applicable: true, socStatus: "FullyComply", companyId: ids.a },
      { rId: 910002, standard: "ISO 14001", pId: "P2", processAreaId: ids.paA2, requirementId: "MIC-REQ-2", clauseContent: "Risk assessment clause", intentOutcome: "Risk", clauseApplicability: "All", applicable: true, socStatus: "PartiallyComply", companyId: ids.a },
      { rId: 910003, standard: "ISO 14001", pId: "P3", processAreaId: ids.paA2, requirementId: "MIC-REQ-3", clauseContent: "Operational control clause", intentOutcome: "Control", clauseApplicability: "All", applicable: true, socStatus: "NotComply", companyId: ids.a },
    ],
  });

  // Assessments + findings + actions.
  await prisma.assessment.createMany({
    data: [
      { id: ids.assA1, activityTypeId: ids.atType, name: "MIC Audit A1", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.a, processAreaId: ids.paA1 },
      { id: ids.assA2, activityTypeId: ids.atType, name: "MIC Audit A2", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.a, processAreaId: ids.paA2 },
    ],
  });
  await prisma.finding.createMany({
    data: [
      { id: ids.findingA1, assessmentId: ids.assA1, description: "MIC governance gap", severity: "Medium", processAreaId: ids.paA1 },
      { id: ids.findingA2, assessmentId: ids.assA2, description: "MIC operational finding", severity: "High", processAreaId: ids.paA2 },
    ],
  });
  // An OVERDUE action on findingA2 (the attest-target snapshot's overdueActionCount=1).
  await prisma.action.createMany({
    data: [
      { id: ids.actionA2, actionId: "MIC-ACT-02", findingId: ids.findingA2, actionDescription: "Close the operational finding", targetDate: new Date(Date.now() - 1 * 60 * 60 * 1000), apAgreed: true },
    ],
  });

  return ids;
}

seedMicFixtures()
  .then(() => console.log("MIC Ritual fixtures seeded."))
  .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
