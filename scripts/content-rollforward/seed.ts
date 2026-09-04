import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { runBootstrap } from "@/lib/bootstrap";
import { publishContentPack } from "@/lib/content-rollforward";

/**
 * SAMS-016 (Master Content Roll-Forward) throwaway fixtures.
 *
 * Master SAMS001 baseline **v1**:
 *   Standards ST1/ST2 · PAs PA1(ST1)/PA2(ST2) · Reqs R1(PA1)/R2(PA2) ·
 *   Controls CT1(PA1)/CT2(PA2)/CT3(PA2) · Mappings MP1/MP2/MP3 · Template TMPL1.
 *
 * Tenant `RF001` bootstrapped at v1 via `runBootstrap`, then given client data
 * (the "sacred record"): Assessment ASS_T; Findings F1→CT1, F2→CT2, F3→CT3;
 * Action on F1; Attachment evidence on F1; RequirementConclusion on R1. Tenant
 * CT3 is then modified ("TENANT-MODIFIED") → the changed-elsewhere conflict.
 *
 * Then publishes ContentPack **v1** and mutates the MASTER to its **v2** state:
 *   ADD ST3+PA3+R3+CT4+MP4 · CHANGE CT1 + CT3 (master) · REMOVE CT2+MP2.
 * The functional test publishes v2 (fromVersion:1) and exercises the flow.
 *
 * Idempotent cleanup + create. DEV/TEST ONLY.
 */
const PASSWORD = "Test1234!";
const DAY = 24 * 60 * 60 * 1000;
export const WEBHOOK_URL_T = "http://127.0.0.1:3999/nh_rf001";

export const CONTENT_IDS = {
  master: "cmp_sams001",
  tenant: "cmp_rf001",
  provider: "usr_rf_provider",
  adminT: "usr_rf_admin",
  assessorT: "usr_rf_assessor",
  atType: "at_rf_assurance",
  st1: "std_rf_st1", st2: "std_rf_st2", st3: "std_rf_st3",
  pa1: "pa_rf_a1", pa2: "pa_rf_a2", pa3: "pa_rf_a3",
  req1: 900001, req2: 900002, req3: 910001, req3t: 910002, req1t: 910003, req2t: 910004,
  ctl1: "ctl_rf_1", ctl2: "ctl_rf_2", ctl3: "ctl_rf_3", ctl4: "ctl_rf_4",
  tpl1: "tpl_rf_1",
  assT: "ass_rf_t",
  f1: "FID-RF-01", f2: "FID-RF-02", f3: "FID-RF-03",
  actA1: "act_rf_a1",
  ev1: "ev_rf_1",
} as const;

async function cleanup() {
  await prisma.companyContentState.deleteMany({ where: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } });
  await prisma.contentPack.deleteMany({ where: { companyId: CONTENT_IDS.master } });
  await prisma.activityLog.deleteMany({ where: { activityType: { in: ["CONTENT_PACK_PUBLISH", "CONTENT_PACK_ADOPT"] } } });
  await prisma.notificationDelivery.deleteMany({ where: { companyId: CONTENT_IDS.tenant } });
  await prisma.notification.deleteMany({ where: { companyId: CONTENT_IDS.tenant } });
  await prisma.action.deleteMany({ where: { findingId: { in: [CONTENT_IDS.f1] } } });
  await prisma.attachmentMapping.deleteMany({ where: { attachment: { companyId: CONTENT_IDS.tenant } } });
  await prisma.attachment.deleteMany({ where: { companyId: CONTENT_IDS.tenant } });
  await prisma.finding.deleteMany({ where: { id: { in: [CONTENT_IDS.f1, CONTENT_IDS.f2, CONTENT_IDS.f3] } } });
  await prisma.requirementConclusion.deleteMany({ where: { assessment: { companyId: CONTENT_IDS.tenant } } });
  await prisma.controlAssignment.deleteMany({ where: { assessment: { companyId: CONTENT_IDS.tenant } } });
  await prisma.assessment.deleteMany({ where: { id: CONTENT_IDS.assT } });
  await prisma.mapControl2Requirement.deleteMany({ where: { control: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } } });
  await prisma.assessmentTemplateControlLinkage.deleteMany({ where: { template: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } } });
  await prisma.assessmentTemplate.deleteMany({ where: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } });
  await prisma.control.deleteMany({ where: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } });
  await prisma.requirement.deleteMany({ where: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } });
  await prisma.processArea.deleteMany({ where: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } });
  await prisma.standard.deleteMany({ where: { companyId: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: CONTENT_IDS.atType } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: [CONTENT_IDS.provider, CONTENT_IDS.adminT, CONTENT_IDS.assessorT] } } });
  await prisma.user.deleteMany({ where: { id: { in: [CONTENT_IDS.provider, CONTENT_IDS.adminT, CONTENT_IDS.assessorT] } } });
  await prisma.company.deleteMany({ where: { id: { in: [CONTENT_IDS.master, CONTENT_IDS.tenant] } } });
}

async function seedMasterV1() {
  const M = CONTENT_IDS.master;
  await prisma.company.create({ data: { id: M, companyID: "SAMS001", companyName: "SAMS Master" } });
  // Standards
  await prisma.standard.createMany({ data: [
    { id: CONTENT_IDS.st1, standard: "ISO 9001", companyId: M },
    { id: CONTENT_IDS.st2, standard: "ISO 14001", companyId: M },
  ]});
  // Process areas (name is the stable key; not prefixed on master)
  await prisma.processArea.createMany({ data: [
    { id: CONTENT_IDS.pa1, name: "Quality Mgmt", standard: "ISO 9001", pId: "PA-QM", companyId: M },
    { id: CONTENT_IDS.pa2, name: "Env Mgmt", standard: "ISO 14001", pId: "PA-EM", companyId: M },
  ]});
  // Requirements (rId is the global PK — unique across the DB)
  await prisma.requirement.createMany({ data: [
    { rId: CONTENT_IDS.req1, requirementId: "ISO9001-4.4", pId: "PA-QM", standard: "ISO 9001", clauseContent: "Quality policy clause", intentOutcome: "Policy", clauseApplicability: "All", processAreaId: CONTENT_IDS.pa1, companyId: M },
    { rId: CONTENT_IDS.req2, requirementId: "ISO14001-6.1", pId: "PA-EM", standard: "ISO 14001", clauseContent: "Environment risks clause", intentOutcome: "Risk", clauseApplicability: "All", processAreaId: CONTENT_IDS.pa2, companyId: M },
  ]});
  await prisma.control.createMany({ data: [
    { id: CONTENT_IDS.ctl1, name: "Quality Control 1", statement: "CT1 statement v1", controlType: "Procedural", controlRef: "C-QM-01", pId: "PA-QM", standard: "ISO 9001", processAreaId: CONTENT_IDS.pa1, companyId: M },
    { id: CONTENT_IDS.ctl2, name: "Quality Control 2", statement: "CT2 statement", controlType: "Procedural", controlRef: "C-QM-02", pId: "PA-EM", standard: "ISO 14001", processAreaId: CONTENT_IDS.pa2, companyId: M },
    { id: CONTENT_IDS.ctl3, name: "Env Control 3", statement: "CT3 statement v1", controlType: "Procedural", controlRef: "C-ENV-03", pId: "PA-EM", standard: "ISO 14001", processAreaId: CONTENT_IDS.pa2, companyId: M },
  ]});
  await prisma.mapControl2Requirement.createMany({ data: [
    { id: "map_rf_1", controlId: CONTENT_IDS.ctl1, requirementRId: CONTENT_IDS.req1 },
    { id: "map_rf_2", controlId: CONTENT_IDS.ctl2, requirementRId: CONTENT_IDS.req2 },
    { id: "map_rf_3", controlId: CONTENT_IDS.ctl3, requirementRId: CONTENT_IDS.req2 },
  ]});
  await prisma.assessmentTemplate.create({ data: { id: CONTENT_IDS.tpl1, name: "Quality Template", companyId: M } });
  await prisma.assessmentTemplateControlLinkage.create({ data: { id: "tplct_rf_1", templateId: CONTENT_IDS.tpl1, controlId: CONTENT_IDS.ctl1 } });
}

async function seedTenantAndData() {
  const T = CONTENT_IDS.tenant;
  const hash = bcrypt.hashSync(PASSWORD, 10);
  await prisma.company.create({ data: { id: T, companyID: "RF001", companyName: "Riverfield Ltd", notificationWebhookUrl: WEBHOOK_URL_T } });
  // Provider + client monitors.
  await prisma.user.createMany({ data: [
    { id: CONTENT_IDS.provider, name: "RF Provider", username: "rf_provider", passwordHash: hash, role: "Assessor", active: true, companyId: T, providerRole: "ProviderAdmin" },
    { id: CONTENT_IDS.adminT, name: "RF Admin", username: "rf_admin", passwordHash: hash, role: "Admin", active: true, companyId: T },
    { id: CONTENT_IDS.assessorT, name: "RF Assessor", username: "rf_assessor", passwordHash: hash, role: "Assessor", active: true, companyId: T },
  ]});
  await prisma.userCompany.createMany({ data: [
    { id: "uc_rf_prov", userId: CONTENT_IDS.provider, companyId: T },
    { id: "uc_rf_admin", userId: CONTENT_IDS.adminT, companyId: T },
    { id: "uc_rf_ass", userId: CONTENT_IDS.assessorT, companyId: T },
  ]});
  await prisma.assuranceActivityType.create({ data: { id: CONTENT_IDS.atType, name: "Assurance Review", defaultLOA: "SecondLine" } });

  // Bootstrap the tenant at v1 (destructive copy from SAMS001 — allowed here,
  // this is the initial content-adoption path, NOT the roll-forward adopt path).
  await runBootstrap(T);

  // Re-read tenant content to find the copied control ids / req rIds.
  const tpa = await prisma.processArea.findMany({ where: { companyId: T } });
  const paByKey = new Map(tpa.map((pa) => [pa.name.replace(/^\[[^\]]*\]\s+/, ""), pa.id]));
  const tctl = await prisma.control.findMany({ where: { companyId: T } });
  const ctlByRef = new Map(tctl.map((c) => [c.controlRef, c.id]));
  const treq = await prisma.requirement.findMany({ where: { companyId: T } });
  const reqByRequirementId = new Map(treq.map((r) => [r.requirementId, r.rId]));

  // Client "sacred" data.
  await prisma.assessment.create({ data: { id: CONTENT_IDS.assT, activityTypeId: CONTENT_IDS.atType, name: "RF Assess ASS_T", assessorId: CONTENT_IDS.provider, startDate: new Date(), loa: "SecondLine", status: "InProgress", companyId: T, processAreaId: paByKey.get("Quality Mgmt") } });
  await prisma.finding.createMany({ data: [
    { id: CONTENT_IDS.f1, assessmentId: CONTENT_IDS.assT, description: "RF finding 1", severity: "Medium", processAreaId: paByKey.get("Quality Mgmt") },
    { id: CONTENT_IDS.f2, assessmentId: CONTENT_IDS.assT, description: "RF finding 2", severity: "High", processAreaId: paByKey.get("Env Mgmt") },
    { id: CONTENT_IDS.f3, assessmentId: CONTENT_IDS.assT, description: "RF finding 3", severity: "Low", processAreaId: paByKey.get("Env Mgmt") },
  ]});
  await prisma.controlAssignment.createMany({ data: [
    { id: "ca_rf_1", assessmentId: CONTENT_IDS.assT, controlId: ctlByRef.get("C-QM-01")! },
    { id: "ca_rf_2", assessmentId: CONTENT_IDS.assT, controlId: ctlByRef.get("C-QM-02")! },
    { id: "ca_rf_3", assessmentId: CONTENT_IDS.assT, controlId: ctlByRef.get("C-ENV-03")! },
  ]});
  await prisma.action.create({ data: { id: CONTENT_IDS.actA1, actionId: "ACT-RF-01", findingId: CONTENT_IDS.f1, actionDescription: "Close RF finding 1", targetDate: new Date(Date.now() + DAY), apAgreed: true } });
  await prisma.attachment.create({ data: { id: CONTENT_IDS.ev1, description: "RF evidence", fileName: "ev1.pdf", filePath: "/tmp/ev1.pdf", fileSize: 42, uploadedBy: CONTENT_IDS.assessorT, companyId: T } });
  await prisma.attachmentMapping.create({ data: { id: "evm_rf_1", attachmentId: CONTENT_IDS.ev1, destTable: "Finding", recId: CONTENT_IDS.f1 } });
  await prisma.requirementConclusion.create({ data: { id: "rc_rf_1", assessmentId: CONTENT_IDS.assT, requirementRId: reqByRequirementId.get("ISO9001-4.4")!, conclusion: "FullyMet", narrative: "Meets the requirement" } });

  // Conflict setup: tenant modified CT3 after bootstrap (last-adopted baseline = v1).
  await prisma.control.update({ where: { id: ctlByRef.get("C-ENV-03")! }, data: { statement: "TENANT-MODIFIED" } });
}

async function mutateMasterToV2() {
  const M = CONTENT_IDS.master;
  // ADD standard ST3 + PA3 + requirement R3 + control CT4 + mapping MP4.
  await prisma.standard.create({ data: { id: CONTENT_IDS.st3, standard: "ISO 45001", companyId: M } });
  await prisma.processArea.create({ data: { id: CONTENT_IDS.pa3, name: "HSE Mgmt", standard: "ISO 45001", pId: "PA-HSE", companyId: M } });
  await prisma.requirement.create({ data: { rId: CONTENT_IDS.req3, requirementId: "ISO45001-8.1", pId: "PA-HSE", standard: "ISO 45001", clauseContent: "HSE operational clause", intentOutcome: "Control", clauseApplicability: "All", processAreaId: CONTENT_IDS.pa3, companyId: M } });
  await prisma.control.create({ data: { id: CONTENT_IDS.ctl4, name: "HSE Control 4", statement: "CT4 statement", controlType: "Procedural", controlRef: "C-HSE-04", pId: "PA-HSE", standard: "ISO 45001", processAreaId: CONTENT_IDS.pa3, companyId: M } });
  await prisma.mapControl2Requirement.create({ data: { id: "map_rf_4", controlId: CONTENT_IDS.ctl4, requirementRId: CONTENT_IDS.req3 } });
  // CHANGE master CT1 + CT3 statements.
  await prisma.control.update({ where: { id: CONTENT_IDS.ctl1 }, data: { statement: "CT1 statement v2" } });
  await prisma.control.update({ where: { id: CONTENT_IDS.ctl3 }, data: { statement: "CT3 statement v2 (master)" } });
  // REMOVE master CT2 (+ cascade MP2) and the MP2 mapping row.
  await prisma.mapControl2Requirement.deleteMany({ where: { id: "map_rf_2" } });
  await prisma.control.delete({ where: { id: CONTENT_IDS.ctl2 } });
}

export async function seedContentRollforward() {
  await cleanup();
  await seedMasterV1();
  await seedTenantAndData();
  // Publish pack v1 (snapshot of the master at v1).
  await publishContentPack({ fromVersion: 0 });
  // Mutate master to its v2 state (the test publishes v2 via the route).
  await mutateMasterToV2();
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  seedContentRollforward()
    .then(() => console.log("Content Roll-Forward fixtures seeded (master v1 → v2 state; tenant RF001 at v1)."))
    .catch((e) => { console.error("Seed failed:", e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
