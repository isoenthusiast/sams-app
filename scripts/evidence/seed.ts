import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * SAMS-013 transcript→evidence chain — throwaway fixtures.
 *
 * Two companies (EV-A = "Evidence Alpha", EV-B = "Evidence Beta"), each with an
 * Admin + an assessment + two audit checklist items + one meeting transcript
 * whose content explicitly mentions the checklist item's key terms (so the
 * deterministic keyword extractor locates it and computes a real span).
 *
 * Idempotent: cleans up its own rows first. DEV/TEST ONLY — never the real
 * SAMS001 / SMDS / OGP companies.
 */
export const EV_IDS = {
  a: "cmp_ev_a",
  b: "cmp_ev_b",
  adminA: "usr_ev_admin_a",
  adminB: "usr_ev_admin_b",
  assB: "usr_ev_ass_b",
  actType: "at_ev_activity",
  paA: "pa_ev_a",
  paB: "pa_ev_b",
  stdA: "std_ev_a",
  stdB: "std_ev_b",
  transcriptA: "kb_ev_tr_a",
  transcriptB: "kb_ev_tr_b",
  assessmentA: "ass_ev_a",
  assessmentB: "ass_ev_b",
  templateA: "tpl_ev_a",
  templateB: "tpl_ev_b",
  tplItemA1: "tpl_ev_a_i1",
  tplItemA2: "tpl_ev_a_i2",
  tplItemB1: "tpl_ev_b_i1",
  tplItemB2: "tpl_ev_b_i2",
  clItemA1: "cli_ev_a1",
  clItemA2: "cli_ev_a2",
  clItemB1: "cli_ev_b1",
  clItemB2: "cli_ev_b2",
  findingA: "FID-EV-A01",
  findingB: "FID-EV-B01",
} as const;

const PASSWORD = "Test1234!";

// Checklist item text + the transcript sentence that evidences it (verbatim).
const ITEM_A1 = "Gas detector calibration is performed per the schedule and calibration records are retained.";
const ITEM_A2 = "Emergency evacuation drills are conducted and attendance recorded.";
const ITEM_B1 = "Waste segregation is verified at the point of generation.";
const ITEM_B2 = "Contractor safety inductions are completed before work starts.";

const TRANSCRIPT_A =
  "Topic: monthly HSE review.\nFacilitator: The team confirmed that " + ITEM_A1 +
  " We also reviewed emergency preparedness: " + ITEM_A2 +
  " The register shows each drill was attended and signed. No deviations pending.";

const TRANSCRIPT_B =
  "Topic: monthly environmental check.\nOn waste handling, " + ITEM_B1 +
  " We also noted that " + ITEM_B2 +
  " The roster confirms attendance for each induction session.";

async function cleanUp() {
  const id = EV_IDS;
  // Proposal-dependent rows first (attachments/junctions referencing checklist items).
  await prisma.attachmentMapping.deleteMany({ where: { destTable: "AuditChecklistItem", recId: { in: [id.clItemA1, id.clItemA2, id.clItemB1, id.clItemB2] } } });
  await prisma.extractionProposal.deleteMany({ where: { companyId: { in: [id.a, id.b] } } });
  await prisma.action.deleteMany({ where: { finding: { assessmentId: { in: [id.assessmentA, id.assessmentB] } } } });
  await prisma.finding.deleteMany({ where: { id: { in: [id.findingA, id.findingB] } } });
  await prisma.auditChecklistItem.deleteMany({ where: { id: { in: [id.clItemA1, id.clItemA2, id.clItemB1, id.clItemB2] } } });
  await prisma.auditChecklistTemplateItem.deleteMany({ where: { id: { in: [id.tplItemA1, id.tplItemA2, id.tplItemB1, id.tplItemB2] } } });
  await prisma.auditChecklistTemplate.deleteMany({ where: { id: { in: [id.templateA, id.templateB] } } });
  await prisma.knowledgebase.deleteMany({ where: { kID: { in: [id.transcriptA, id.transcriptB] } } });
  await prisma.assessment.deleteMany({ where: { id: { in: [id.assessmentA, id.assessmentB] } } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: [id.adminA, id.adminB, id.assB] } } });
  await prisma.processArea.deleteMany({ where: { id: { in: [id.paA, id.paB] } } });
  await prisma.standard.deleteMany({ where: { id: { in: [id.stdA, id.stdB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [id.adminA, id.adminB, id.assB] } } });
  await prisma.assuranceActivityType.deleteMany({ where: { id: id.actType } });
  await prisma.company.deleteMany({ where: { id: { in: [id.a, id.b] } } });
}

export async function seedEvidence(): Promise<void> {
  await cleanUp();
  const id = EV_IDS;
  const hash = bcrypt.hashSync(PASSWORD, 10);

  await prisma.company.createMany({
    data: [
      { id: id.a, companyID: "EV001", companyName: "Evidence Alpha" },
      { id: id.b, companyID: "EV002", companyName: "Evidence Beta" },
    ],
  });
  await prisma.assuranceActivityType.create({ data: { id: id.actType, name: "EV Remote Audit", defaultLOA: "SecondLine" } });
  await prisma.standard.createMany({
    data: [
      { id: id.stdA, standard: "ISO-9001-EV", companyId: id.a },
      { id: id.stdB, standard: "ISO-14001-EV", companyId: id.b },
    ],
  });
  await prisma.processArea.createMany({
    data: [
      { id: id.paA, name: "EV Process A", companyId: id.a },
      { id: id.paB, name: "EV Process B", companyId: id.b },
    ],
  });

  await prisma.user.createMany({
    data: [
      { id: id.adminA, name: "EVA Admin", username: "ev_admin_a", passwordHash: hash, role: "Admin", active: true, companyId: id.a },
      { id: id.adminB, name: "EVB Admin", username: "ev_admin_b", passwordHash: hash, role: "Admin", active: true, companyId: id.b },
      // Non-Admin assessor of B — proves cross-tenant read isolation (a plain
      // Admin has the app's global-operator access; an Assessor must not).
      { id: id.assB, name: "EVB Assessor", username: "ev_ass_b", passwordHash: hash, role: "Assessor", active: true, companyId: id.b },
    ],
  });
  await prisma.userCompany.createMany({
    data: [
      { id: "uc_ev_admin_a", userId: id.adminA, companyId: id.a },
      { id: "uc_ev_admin_b", userId: id.adminB, companyId: id.b },
      { id: "uc_ev_ass_b", userId: id.assB, companyId: id.b },
    ],
  });

  await prisma.assessment.createMany({
    data: [
      { id: id.assessmentA, activityTypeId: id.actType, name: "EV Audit A", assessorId: id.adminA, startDate: new Date(), loa: "SecondLine", companyId: id.a },
      { id: id.assessmentB, activityTypeId: id.actType, name: "EV Audit B", assessorId: id.adminB, startDate: new Date(), loa: "SecondLine", companyId: id.b },
    ],
  });

  // Transcripts (entryType=Transcript).
  await prisma.knowledgebase.createMany({
    data: [
      { kID: id.transcriptA, knowledgeName: "EV Monthly HSE Review", knowledgeContent: TRANSCRIPT_A, entryType: "Transcript", meetingDate: new Date(), companyId: id.a, addedBy: "EVA Admin" },
      { kID: id.transcriptB, knowledgeName: "EV Monthly Env Check", knowledgeContent: TRANSCRIPT_B, entryType: "Transcript", meetingDate: new Date(), companyId: id.b, addedBy: "EVB Admin" },
    ],
  });

  // Checklist templates + items, then clone into assessments.
  await prisma.auditChecklistTemplate.createMany({
    data: [
      { id: id.templateA, name: "EV Checklist A", auditStandard: "ISO-9001-EV", companyId: id.a },
      { id: id.templateB, name: "EV Checklist B", auditStandard: "ISO-14001-EV", companyId: id.b },
    ],
  });
  await prisma.auditChecklistTemplateItem.createMany({
    data: [
      { id: id.tplItemA1, checklistItemId: "7.1", checklistText: ITEM_A1, auditStandard: "ISO-9001-EV", sortOrder: 1, templateId: id.templateA },
      { id: id.tplItemA2, checklistItemId: "7.2", checklistText: ITEM_A2, auditStandard: "ISO-9001-EV", sortOrder: 2, templateId: id.templateA },
      { id: id.tplItemB1, checklistItemId: "8.1", checklistText: ITEM_B1, auditStandard: "ISO-14001-EV", sortOrder: 1, templateId: id.templateB },
      { id: id.tplItemB2, checklistItemId: "8.2", checklistText: ITEM_B2, auditStandard: "ISO-14001-EV", sortOrder: 2, templateId: id.templateB },
    ],
  });
  await prisma.auditChecklistItem.createMany({
    data: [
      { id: id.clItemA1, checklistItemId: "7.1", checklistText: ITEM_A1, auditStandard: "ISO-9001-EV", assessmentId: id.assessmentA, templateItemId: id.tplItemA1, templateId: id.templateA },
      { id: id.clItemA2, checklistItemId: "7.2", checklistText: ITEM_A2, auditStandard: "ISO-9001-EV", assessmentId: id.assessmentA, templateItemId: id.tplItemA2, templateId: id.templateA },
      { id: id.clItemB1, checklistItemId: "8.1", checklistText: ITEM_B1, auditStandard: "ISO-14001-EV", assessmentId: id.assessmentB, templateItemId: id.tplItemB1, templateId: id.templateB },
      { id: id.clItemB2, checklistItemId: "8.2", checklistText: ITEM_B2, auditStandard: "ISO-14001-EV", assessmentId: id.assessmentB, templateItemId: id.tplItemB2, templateId: id.templateB },
    ],
  });

  // A pre-existing proposal WITH a suggested action, so the confirm path's
  // "draft Action created" assertion is exercised deterministically (the keyword
  // extractor returns no suggested action). Fixture only — dev/test.
  await prisma.extractionProposal.create({
    data: {
      status: "Proposed",
      knowledgebaseId: id.transcriptA,
      assessmentId: id.assessmentA,
      auditChecklistItemId: id.clItemA1,
      companyId: id.a,
      spanStart: TRANSCRIPT_A.indexOf(ITEM_A1),
      spanEnd: TRANSCRIPT_A.indexOf(ITEM_A1) + ITEM_A1.length,
      evidenceExcerpt: ITEM_A1,
      suggestedAction: "Follow up on any missed calibration windows within 30 days.",
      proposedBy: "AI",
      proposedByUserId: id.adminA,
      transcriptTitle: "EV Monthly HSE Review",
    },
  });
}

// Only invoked when run directly (not when imported by the test runner).
if (process.argv[1]?.endsWith("seed.ts")) {
  seedEvidence()
    .catch((e) => {
      console.error("SAMS-013 seed errored:", e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
