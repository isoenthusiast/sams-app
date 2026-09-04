import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * SAMS-015 — Tamper-Evident Audit Trail harness fixtures.
 *
 * Two companies (A / B) with an assessment, finding, action, client-Admin user,
 * evidence request and API key each (so ActivityLog rows referencing them resolve
 * to a company), plus GLOBAL / UNRESOLVABLE rows (some refTable that has no
 * company, and a refRecord pointing at a non-existent row). Then a set of LEGACY
 * ActivityLog rows are inserted with the ORIGINAL columns only (no `companyId` /
 * `chainHash` — those are null) to simulate the pre-SAMS-015 audit log the
 * migration must backfill.
 *
 * Order: seed → run the migration → the migration resolves companyId, computes the
 * per-company chain and emits resolution stats → verify/functional tests.
 *
 * Idempotent: cleans up its own fixture first. DEV/TEST ONLY.
 */
export const AC_IDS = {
  a: "cmp_ac_a",
  b: "cmp_ac_b",
  actType: "at_ac_audit",
  provider: "usr_ac_provider",
  adminA: "usr_ac_admin_a",
  adminB: "usr_ac_admin_b",
  assessmentA: "ass_ac_a",
  assessmentB: "ass_ac_b",
  findingA: "FID-AC-A01",
  findingB: "FID-AC-B01",
  actionA: "act_ac_a01",
  erA: "er_ac_a01",
  erB: "er_ac_b01",
  apiKeyA: "ac_api_a01",
  apiKeyB: "ac_api_b01",
  legacyRowA1: "logac_a1",
  legacyRowA2: "logac_a2",
  legacyRowB1: "logac_b1",
  legacyRowG1: "logac_g1",
};

const PASSWORD = "Test1234!";

// Local webhook receiver paths — set per company so cross-tenant is observable.
export const AC_WEBHOOK_A = "http://127.0.0.1:3999/ac_a";
export const AC_WEBHOOK_B = "http://127.0.0.1:3999/ac_b";

export async function seedAuditChainFixtures() {
  const ids = AC_IDS;
  const users = [ids.provider, ids.adminA, ids.adminB];

  // Cleanup (FK-safe: dependents first) — own fixture only.
  const legacyIds = [
    "logac_a1", "logac_a2", "logac_a3", "logac_a4", "logac_a5", "logac_a6", "logac_a7",
    "logac_b1", "logac_b2", "logac_b3", "logac_b4",
    "logac_g1", "logac_g2", "logac_g3", "logac_g4",
  ];
  await prisma.activityLog.deleteMany({ where: { id: { in: legacyIds } } });
  // Delete any rows referencing our entities (created by the test's write-path probe).
  await prisma.activityLog.deleteMany({
    where: { OR: [
      { refRecord: ids.assessmentA }, { refRecord: ids.assessmentB },
      { refRecord: ids.findingA }, { refRecord: ids.findingB },
      { refRecord: ids.actionA }, { refRecord: ids.erA }, { refRecord: ids.erB },
      { refRecord: ids.apiKeyA }, { refRecord: ids.apiKeyB },
      { refRecord: ids.adminA }, { refRecord: ids.adminB },
    ] },
  });
  await prisma.apiKey.deleteMany({ where: { id: { in: [ids.apiKeyA, ids.apiKeyB] } } });
  await prisma.evidenceRequest.deleteMany({ where: { id: { in: [ids.erA, ids.erB] } } });
  await prisma.action.deleteMany({ where: { id: ids.actionA } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA, ids.findingB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assessmentA, ids.assessmentB] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.actType } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });

  await prisma.company.createMany({
    data: [
      { id: ids.a, companyID: "AC001", companyName: "Audit Cache Alpha", notificationWebhookUrl: AC_WEBHOOK_A },
      { id: ids.b, companyID: "AC002", companyName: "Audit Cache Beta", notificationWebhookUrl: AC_WEBHOOK_B },
    ],
  });
  await prisma.assuranceActivityType.create({ data: { id: ids.actType, name: "AC Remote Audit", defaultLOA: "SecondLine" } });
  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      { id: ids.provider, name: "AC Provider", username: "ac_provider", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a, providerRole: "ProviderAdmin" },
      { id: ids.adminA, name: "AC Admin A", username: "ac_admin_a", passwordHash: hash, role: "Admin", active: true, companyId: ids.a },
      { id: ids.adminB, name: "AC Admin B", username: "ac_admin_b", passwordHash: hash, role: "Admin", active: true, companyId: ids.b },
    ],
  });
  await prisma.assessment.createMany({
    data: [
      { id: ids.assessmentA, activityTypeId: ids.actType, name: "AC Audit A", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.a },
      { id: ids.assessmentB, activityTypeId: ids.actType, name: "AC Audit B", assessorId: ids.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: ids.b },
    ],
  });
  await prisma.finding.createMany({
    data: [
      { id: ids.findingA, assessmentId: ids.assessmentA, description: "AC Gap A", severity: "Medium" },
      { id: ids.findingB, assessmentId: ids.assessmentB, description: "AC Gap B", severity: "High" },
    ],
  });
  await prisma.action.create({
    data: { id: ids.actionA, findingId: ids.findingA, actionDescription: "AC action A", apAgreed: true },
  });
  await prisma.evidenceRequest.createMany({
    data: [
      { id: ids.erA, companyId: ids.a, assessmentId: ids.assessmentA, title: "AC ER A", instructions: "Attach.", requestedByUserId: ids.provider, requestedFromUserId: ids.adminA, status: "Requested" },
      { id: ids.erB, companyId: ids.b, assessmentId: ids.assessmentB, title: "AC ER B", instructions: "Attach.", requestedByUserId: ids.provider, requestedFromUserId: ids.adminB, status: "Requested" },
    ],
  });
  await prisma.apiKey.createMany({
    data: [
      { id: ids.apiKeyA, companyId: ids.a, keyHash: hash, label: "AC key A" },
      { id: ids.apiKeyB, companyId: ids.b, keyHash: hash, label: "AC key B" },
    ],
  });

  // LEGACY ActivityLog rows — ORIGINAL columns only (no companyId / chainHash).
  // These are what the migration must backfill. Use explicit ids + staggered
  // createdAt so ordering is deterministic and observable.
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  const mk = (id: string, offset: number, row: { activityType: string; description: string; username: string; refTable?: string; refRecord?: string }) => ({
    id,
    timestamp: new Date(base + offset),
    createdAt: new Date(base + offset),
    activityType: row.activityType,
    description: row.description,
    username: row.username,
    refTable: row.refTable ?? null,
    refRecord: row.refRecord ?? null,
  });

  await prisma.activityLog.createMany({
    data: [
      mk(ids.legacyRowA1, 1000, { activityType: "ASSESSMENT_CREATED", description: "Assessment A created", username: "provider", refTable: "Assessment", refRecord: ids.assessmentA }),
      mk("logac_a2", 2000, { activityType: "FINDING_ADDED", description: "Finding A added", username: "provider", refTable: "Finding", refRecord: ids.findingA }),
      mk("logac_a3", 3000, { activityType: "ACTION_CREATED", description: "Action A created", username: "provider", refTable: "Action", refRecord: ids.actionA }),
      mk("logac_a4", 4000, { activityType: "EVIDENCE_REQUEST_CREATED", description: "ER A created", username: "provider", refTable: "EvidenceRequest", refRecord: ids.erA }),
      mk("logac_a5", 5000, { activityType: "API_KEY_CREATE", description: "Key A created", username: "provider", refTable: "ApiKey", refRecord: ids.apiKeyA }),
      mk("logac_a6", 6000, { activityType: "USER_UPDATED", description: "Admin A updated", username: "provider", refTable: "User", refRecord: ids.adminA }),
      mk("logac_a7", 7000, { activityType: "COMPANY_RETENTION", description: "Retention A", username: "provider", refTable: "Company", refRecord: ids.a }),
      // Company B.
      mk(ids.legacyRowB1, 1000, { activityType: "ASSESSMENT_CREATED", description: "Assessment B created", username: "provider", refTable: "Assessment", refRecord: ids.assessmentB }),
      mk("logac_b2", 2000, { activityType: "FINDING_ADDED", description: "Finding B added", username: "provider", refTable: "Finding", refRecord: ids.findingB }),
      mk("logac_b3", 3000, { activityType: "EVIDENCE_REQUEST_CREATED", description: "ER B created", username: "provider", refTable: "EvidenceRequest", refRecord: ids.erB }),
      mk("logac_b4", 4000, { activityType: "API_KEY_CREATE", description: "Key B created", username: "provider", refTable: "ApiKey", refRecord: ids.apiKeyB }),
      // GLOBAL / UNRESOLVABLE — no company chain.
      mk(ids.legacyRowG1, 1000, { activityType: "UNKNOWN_ENTITY_EVENT", description: "Unknown refTable", username: "operator", refTable: "UnknownEntity", refRecord: "nope" }),
      mk("logac_g2", 2000, { activityType: "GHOST_REF", description: "Referenced row deleted", username: "operator", refTable: "EvidenceRequest", refRecord: "deleted_er_0000" }),
      mk("logac_g3", 3000, { activityType: "GLOBAL_OP", description: "No ref", username: "operator" }),
      mk("logac_g4", 4000, { activityType: "health_reset", description: "Control reset", username: "admin", refTable: "Control" }),
    ],
  });

  return ids;
}

// Standalone runner: `tsx scripts/audit-chain/seed.ts`
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  seedAuditChainFixtures()
    .then(() => console.log("SAMS-015 audit-chain fixtures seeded."))
    .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
