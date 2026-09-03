import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Seed two throwaway companies (A and B) for the Data Trust Gate isolation
 * suite. Each company gets one row in every company-scoped model we probe, so
 * the query-isolation tests can prove company-A scoping never returns company-B
 * rows. These are DEVELOPMENT/TEST companies only (codes DTA001 / DTA002) —
 * never the real SAMS001 / SMDS / OGP companies. Idempotent: cleans up its own
 * rows first, then re-inserts.
 */

export type FixtureIds = typeof FIXTURE_IDS;

export const FIXTURE_IDS = {
  a: "cmp_dta_a",
  b: "cmp_dta_b",
  actType: "at_dta_activity",
  userA: "usr_dta_a",
  userB: "usr_dta_b",
  standardA: "std_dta_a",
  standardB: "std_dta_b",
  paA: "pa_dta_a",
  paB: "pa_dta_b",
  subA: "sub_dta_a",
  subB: "sub_dta_b",
  controlA: "ctl_dta_a",
  controlB: "ctl_dta_b",
  reqA: 7001,
  reqB: 7002,
  assessmentA: "ass_dta_a",
  assessmentB: "ass_dta_b",
  findingA: "FID-DTA-A01",
  findingB: "FID-DTA-B01",
  actionA: "act_dta_a",
  actionB: "act_dta_b",
  sampleA: "smp_dta_a",
  sampleB: "smp_dta_b",
  kbA: "kb_dta_a",
  kbB: "kb_dta_b",
  tagA: "tag_dta_a",
  tagB: "tag_dta_b",
  deptA: "dep_dta_a",
  deptB: "dep_dta_b",
  posA: "pos_dta_a",
  posB: "pos_dta_b",
  mapA: "mpc_dta_a",
  mapB: "mpc_dta_b",
  docA: "doc_dta_a",
  docB: "doc_dta_b",
  gamifA: "gam_dta_a",
  gamifB: "gam_dta_b",
};

const users = [FIXTURE_IDS.userA, FIXTURE_IDS.userB];

async function cleanUp() {
  const ids = FIXTURE_IDS;
  await prisma.userCompany.deleteMany({ where: { userId: { in: users } } });
  await prisma.action.deleteMany({ where: { id: { in: [ids.actionA, ids.actionB] } } });
  await prisma.finding.deleteMany({ where: { id: { in: [ids.findingA, ids.findingB] } } });
  await prisma.sample.deleteMany({ where: { id: { in: [ids.sampleA, ids.sampleB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [ids.assessmentA, ids.assessmentB] } } });
  await prisma.mapControl2Requirement.deleteMany({ where: { id: { in: [ids.mapA, ids.mapB] } } });
  await prisma.document.deleteMany({ where: { id: { in: [ids.docA, ids.docB] } } });
  await prisma.gamificationStage.deleteMany({ where: { id: { in: [ids.gamifA, ids.gamifB] } } });
  await prisma.knowledgebase.deleteMany({ where: { kID: { in: [ids.kbA, ids.kbB] } } });
  await prisma.tag.deleteMany({ where: { id: { in: [ids.tagA, ids.tagB] } } });
  await prisma.control.deleteMany({ where: { id: { in: [ids.controlA, ids.controlB] } } });
  await prisma.subProcess.deleteMany({ where: { id: { in: [ids.subA, ids.subB] } } });
  await prisma.processArea.deleteMany({ where: { id: { in: [ids.paA, ids.paB] } } });
  await prisma.standard.deleteMany({ where: { id: { in: [ids.standardA, ids.standardB] } } });
  await prisma.requirement.deleteMany({ where: { rId: { in: [ids.reqA, ids.reqB] } } });
  await prisma.position.deleteMany({ where: { id: { in: [ids.posA, ids.posB] } } });
  await prisma.department.deleteMany({ where: { id: { in: [ids.deptA, ids.deptB] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: ids.actType } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
}

export async function seedFixtures(): Promise<FixtureIds> {
  const ids = FIXTURE_IDS;
  await cleanUp();

  await prisma.company.createMany({
    data: [
      { id: ids.a, companyID: "DTA001", companyName: "Data Trust Alpha" },
      { id: ids.b, companyID: "DTA002", companyName: "Data Trust Beta" },
    ],
  });

  await prisma.assuranceActivityType.create({ data: { id: ids.actType, name: "DTA Remote Audit", defaultLOA: "SecondLine" } });

  const hash = bcrypt.hashSync("Test1234!", 10);
  await prisma.user.createMany({
    data: [
      { id: ids.userA, name: "Alpha User", username: "dta_alpha", passwordHash: hash, role: "Assessor", active: true, companyId: ids.a },
      { id: ids.userB, name: "Beta User", username: "dta_beta", passwordHash: hash, role: "Assessor", active: true, companyId: ids.b },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "uc_dta_a", userId: ids.userA, companyId: ids.a },
      { id: "uc_dta_b", userId: ids.userB, companyId: ids.b },
    ],
  });

  await prisma.standard.createMany({
    data: [
      { id: ids.standardA, standard: "ISO-9001-DTA", companyId: ids.a },
      { id: ids.standardB, standard: "ISO-14001-DTA", companyId: ids.b },
    ],
  });
  await prisma.processArea.createMany({
    data: [
      { id: ids.paA, name: "DTA Process A", companyId: ids.a },
      { id: ids.paB, name: "DTA Process B", companyId: ids.b },
    ],
  });
  await prisma.subProcess.createMany({
    data: [
      { id: ids.subA, name: "DTA Sub A", processAreaId: ids.paA, companyId: ids.a },
      { id: ids.subB, name: "DTA Sub B", processAreaId: ids.paB, companyId: ids.b },
    ],
  });
  await prisma.control.createMany({
    data: [
      { id: ids.controlA, name: "DTA Control A", statement: "A", controlType: "Administrative", companyId: ids.a },
      { id: ids.controlB, name: "DTA Control B", statement: "B", controlType: "Administrative", companyId: ids.b },
    ],
  });
  await prisma.requirement.createMany({
    data: [
      { rId: ids.reqA, standard: "ISO-9001-DTA", pId: "DTA-1", requirementId: "DTA-REQ-A", clauseContent: "A", intentOutcome: "A", clauseApplicability: "yes", companyId: ids.a, socStatus: "FullyComply", socSummary: "A" },
      { rId: ids.reqB, standard: "ISO-14001-DTA", pId: "DTA-2", requirementId: "DTA-REQ-B", clauseContent: "B", intentOutcome: "B", clauseApplicability: "yes", companyId: ids.b, socStatus: "NotComply", socSummary: "B" },
    ],
  });
  await prisma.assessment.createMany({
    data: [
      { id: ids.assessmentA, activityTypeId: ids.actType, name: "DTA Audit A", assessorId: ids.userA, startDate: new Date(), loa: "SecondLine", companyId: ids.a },
      { id: ids.assessmentB, activityTypeId: ids.actType, name: "DTA Audit B", assessorId: ids.userB, startDate: new Date(), loa: "SecondLine", companyId: ids.b },
    ],
  });
  await prisma.finding.createMany({
    data: [
      { id: ids.findingA, assessmentId: ids.assessmentA, description: "Gap A", severity: "Medium", requirementRId: ids.reqA },
      { id: ids.findingB, assessmentId: ids.assessmentB, description: "Gap B", severity: "High", requirementRId: ids.reqB },
    ],
  });
  await prisma.action.createMany({
    data: [
      { id: ids.actionA, findingId: ids.findingA, actionDescription: "Fix A", targetDate: new Date(Date.now() + 86400000) },
      { id: ids.actionB, findingId: ids.findingB, actionDescription: "Fix B", targetDate: new Date(Date.now() + 86400000) },
    ],
  });
  await prisma.sample.createMany({
    data: [
      { id: ids.sampleA, assessmentId: ids.assessmentA, recordReference: "SMP-A" },
      { id: ids.sampleB, assessmentId: ids.assessmentB, recordReference: "SMP-B" },
    ],
  });
  await prisma.knowledgebase.createMany({
    data: [
      { kID: ids.kbA, knowledgeName: "DTA KB A", knowledgeContent: "A", addedBy: ids.userA, companyId: ids.a },
      { kID: ids.kbB, knowledgeName: "DTA KB B", knowledgeContent: "B", addedBy: ids.userB, companyId: ids.b },
    ],
  });
  await prisma.tag.createMany({
    data: [
      { id: ids.tagA, name: "DTA TAG A", companyId: ids.a },
      { id: ids.tagB, name: "DTA TAG B", companyId: ids.b },
    ],
  });
  await prisma.department.createMany({
    data: [
      { id: ids.deptA, name: "DTA Dept A", companyId: ids.a },
      { id: ids.deptB, name: "DTA Dept B", companyId: ids.b },
    ],
  });
  await prisma.position.createMany({
    data: [
      { id: ids.posA, title: "DTA Pos A", departmentId: ids.deptA },
      { id: ids.posB, title: "DTA Pos B", departmentId: ids.deptB },
    ],
  });
  await prisma.mapControl2Requirement.createMany({
    data: [
      { id: ids.mapA, controlId: ids.controlA, requirementRId: ids.reqA, processAreaId: ids.paA, mandatory: true },
      { id: ids.mapB, controlId: ids.controlB, requirementRId: ids.reqB, processAreaId: ids.paB, mandatory: false },
    ],
  });
  await prisma.document.createMany({
    data: [
      { id: ids.docA, documentNo: "DOC-DTA-A", filename: "a.pdf", documentContent: "A", companyId: ids.a },
      { id: ids.docB, documentNo: "DOC-DTA-B", filename: "b.pdf", documentContent: "B", companyId: ids.b },
    ],
  });
  await prisma.gamificationStage.createMany({
    data: [
      { id: ids.gamifA, companyId: ids.a, stage: 2 },
      { id: ids.gamifB, companyId: ids.b, stage: 0 },
    ],
  });

  return ids;
}
