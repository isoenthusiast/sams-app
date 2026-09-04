import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/authz";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * SAMS-013 — the human-confirmed half of the transcript→evidence chain.
 *
 * A CONFIRMED proposal lands on EXISTING rails (no parallel evidence universe):
 *   - evidence → an Attachment on the checklist-item audit
 *     (destTable="AuditChecklistItem", recId=<checklist item id>) — the exact
 *     surface the checklist audit page already renders (AttachmentList).
 *   - suggested action → a draft Action (apAgreed=false) on a Finding for that
 *     checklist item, which the human then activates.
 *
 * REJECTED is recorded (status + rejecting user + timestamp) and never
 * resurfaced — the proposal never links anything.
 *
 * Only a PROPOSED proposal can transition (idempotent: re-confirming/rejecting
 * an already-decided proposal is a no-op returning its current state), so
 * UNCONFIRMED proposals remain invisible to SOC/exports by construction.
 */

export type ConfirmOutcome = {
  proposalId: string;
  status: "Confirmed" | "Rejected" | "Proposed";
  evidenceAttachmentId?: string | null;
  findingId?: string | null;
  actionId?: string | null;
  evidenceExcerpt: string;
};

async function writeEvidenceFile(proposal: { id: string; evidenceExcerpt: string }, transcriptTitle: string): Promise<string> {
  const dir = path.join(process.cwd(), "public", "attachments", "evidence");
  await mkdir(dir, { recursive: true });
  const safe = proposal.id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 24);
  const filename = `${Date.now()}_${safe}.txt`;
  const filePath = `/attachments/evidence/${filename}`;
  const header = `Transcript evidence (AI-proposed, human-confirmed)\nSource: ${transcriptTitle}\n\n${proposal.evidenceExcerpt}\n`;
  await writeFile(path.join(dir, filename), header, "utf8");
  return filePath;
}

async function linkEvidenceAttachment(proposal: { id: string; auditChecklistItemId: string; evidenceExcerpt: string }, transcriptTitle: string, userName: string) {
  const filePath = await writeEvidenceFile(proposal, transcriptTitle);
  const attachment = await prisma.attachment.create({
    data: {
      description: "Evidence excerpt — transcript evidence chain (human-confirmed). Click to open the full excerpt.",
      fileName: `${transcriptTitle} — evidence.txt`,
      filePath,
      fileSize: Buffer.byteLength(proposal.evidenceExcerpt, "utf8"),
      uploadedBy: userName,
      companyId: undefined, // set below on the mapping
      mappings: {
        create: { destTable: "AuditChecklistItem", recId: proposal.auditChecklistItemId },
      },
    },
  });
  return attachment;
}

async function createDraftAction(proposal: { assessmentId: string; auditChecklistItemId: string; suggestedAction: string }, userId: string, userName: string) {
  // Find an existing Finding on this checklist item (same assessment); else create
  // a draft one so a draft Action can descend from it.
  let finding = await prisma.finding.findFirst({
    where: { assessmentId: proposal.assessmentId, checklistItemId: proposal.auditChecklistItemId },
  });
  if (!finding) {
    const fid = `FID-TXE-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    finding = await prisma.finding.create({
      data: {
        id: fid,
        assessmentId: proposal.assessmentId,
        checklistItemId: proposal.auditChecklistItemId,
        description: `AI-suggested remediation (transcript evidence chain)`,
        severity: "Low",
      },
    });
  }
  const action = await prisma.action.create({
    data: {
      findingId: finding.id,
      actionDescription: proposal.suggestedAction,
      actionDetails: "AI-suggested from transcript evidence; awaiting human activation.",
      apAgreed: false, // draft — the human activates it
    },
  });
  return { finding, action };
}

export async function confirmProposal(
  proposalId: string,
  { userId, userName, transcriptTitle, evidenceExcerptOverride }: { userId: string; userName: string; transcriptTitle?: string | null; evidenceExcerptOverride?: string | null }
): Promise<ConfirmOutcome> {
  const proposal = await prisma.extractionProposal.findUnique({
    where: { id: proposalId },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status === "Confirmed") return { proposalId, status: "Confirmed", evidenceExcerpt: proposal.evidenceExcerpt };
  if (proposal.status === "Rejected") throw new Error("A rejected proposal cannot be confirmed");

  const excerpt = evidenceExcerptOverride?.trim() || proposal.evidenceExcerpt;
  const title = transcriptTitle || proposal.transcriptTitle || "Transcript";

  const attachment = await linkEvidenceAttachment({ id: proposal.id, auditChecklistItemId: proposal.auditChecklistItemId, evidenceExcerpt: excerpt }, title, userName);

  let findingId: string | null = null;
  let actionId: string | null = null;
  if (proposal.suggestedAction) {
    const { finding, action } = await createDraftAction(
      { assessmentId: proposal.assessmentId, auditChecklistItemId: proposal.auditChecklistItemId, suggestedAction: proposal.suggestedAction },
      userId,
      userName
    );
    findingId = finding.id;
    actionId = action.id;
  }

  await prisma.extractionProposal.update({
    where: { id: proposalId },
    data: {
      status: "Confirmed",
      confirmedByUserId: userId,
      confirmedAt: new Date(),
      evidenceExcerpt: excerpt,
    },
  });

  await logActivity({
    userId,
    username: userName,
    action: "EVIDENCE_PROPOSAL_CONFIRMED",
    entityType: "ExtractionProposal",
    entityId: proposalId,
    summary: `Confirmed evidence proposal → linked to checklist item`,
    metadata: { checklistItemId: proposal.auditChecklistItemId, assessmentId: proposal.assessmentId, attachmentId: attachment.id, actionId },
  });

  return { proposalId, status: "Confirmed", evidenceAttachmentId: attachment.id, findingId, actionId, evidenceExcerpt: excerpt };
}

export async function rejectProposal(
  proposalId: string,
  { userId, userName }: { userId: string; userName: string }
): Promise<ConfirmOutcome> {
  const proposal = await prisma.extractionProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status === "Rejected") return { proposalId, status: "Rejected", evidenceExcerpt: proposal.evidenceExcerpt };
  if (proposal.status === "Confirmed") throw new Error("A confirmed proposal cannot be rejected");

  await prisma.extractionProposal.update({
    where: { id: proposalId },
    data: { status: "Rejected", rejectedByUserId: userId, rejectedAt: new Date() },
  });

  await logActivity({
    userId,
    username: userName,
    action: "EVIDENCE_PROPOSAL_REJECTED",
    entityType: "ExtractionProposal",
    entityId: proposalId,
    summary: `Rejected evidence proposal (not linked)`,
    metadata: { checklistItemId: proposal.auditChecklistItemId, assessmentId: proposal.assessmentId },
  });

  return { proposalId, status: "Rejected", evidenceExcerpt: proposal.evidenceExcerpt };
}
