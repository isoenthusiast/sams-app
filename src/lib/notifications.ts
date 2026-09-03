import { prisma } from "@/lib/prisma";

/**
 * In-App Notifications (SAMS-006, Phase 2c) — emit/read helpers.
 *
 * EVENT SET v1 (settled decision #3): EvidenceRequested (→ requestee),
 * EvidenceSubmitted (→ requester), EvidenceReviewed (→ requestee),
 * CommentShared (→ entity participants, excluding the author). Every emission
 * is a FIRED-AND-FORGOTTEN write: `emitNotification` swallows errors and logs,
 * so an emission failure can NEVER fail the parent fabric write (settled decision
 * #4 / B4 negative path) — proven by fault-injection in the test plan.
 *
 * READ SIDE: reads are strictly `recipientUserId`-scoped (the session user's
 * ONLY rows — never company-materialised, so a batch id leak is impossible
 * without an explicit cross-user guard, which the mark-read route enforces).
 * Overdue actions are computed at READ time into the bell-count response as a
 * synthetic count/banner (settled decision #5) — NEVER stored as Notification
 * rows, so no scheduler.
 */

export const NOTIFICATION_TYPE = {
  EVIDENCE_REQUESTED: "EvidenceRequested",
  EVIDENCE_SUBMITTED: "EvidenceSubmitted",
  EVIDENCE_REVIEWED: "EvidenceReviewed",
  COMMENT_SHARED: "CommentShared",
} as const;

export const TITLE_MAX = 200;
export const BODY_MAX = 500;

const NOTIFICATION_ENTITY_EVIDENCE_REQUEST = "EvidenceRequest";
const NOTIFICATION_ENTITY_FINDING = "Finding";

/**
 * Core emit. NEVER throws — any error is logged and swallowed so the caller's
 * parent write always succeeds. Returns true if the row was written.
 */
export async function emitNotification(opts: {
  recipientUserId: string;
  type: string;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  companyId?: string | null;
}): Promise<boolean> {
  try {
    if (!opts.recipientUserId) return false;
    await prisma.notification.create({
      data: {
        recipientUserId: opts.recipientUserId,
        type: opts.type as never,
        entityType: opts.entityType,
        entityId: opts.entityId,
        title: opts.title.slice(0, TITLE_MAX),
        body: opts.body.slice(0, BODY_MAX),
        companyId: opts.companyId ?? null,
      },
    });
    return true;
  } catch (e) {
    console.error(`[notifications] emission failed (${opts.type} → ${opts.recipientUserId}):`, e);
    return false;
  }
}

/** Resolve a user's display name (for notification bodies); id fallback. */
async function userName(userId: string): Promise<string> {
  if (!userId) return "Someone";
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name ?? userId;
}

/** EvidenceRequested — to the requestee. */
export async function emitEvidenceRequested(params: {
  requestId: string;
  requesteeUserId: string;
  requesterUserId: string;
  companyId?: string | null;
}): Promise<void> {
  const er = await prisma.evidenceRequest
    .findUnique({ where: { id: params.requestId }, select: { title: true } })
    .catch(() => null);
  const requesterName = await userName(params.requesterUserId);
  const title = er?.title ?? "an evidence request";
  await emitNotification({
    recipientUserId: params.requesteeUserId,
    type: NOTIFICATION_TYPE.EVIDENCE_REQUESTED,
    entityType: NOTIFICATION_ENTITY_EVIDENCE_REQUEST,
    entityId: params.requestId,
    title: "Evidence requested",
    body: `${requesterName} requested evidence: “${title}”`,
    companyId: params.companyId,
  });
}

/** EvidenceSubmitted — to the requester. */
export async function emitEvidenceSubmitted(params: {
  requestId: string;
  requesterUserId: string;
  requesteeUserId: string;
  companyId?: string | null;
}): Promise<void> {
  const er = await prisma.evidenceRequest
    .findUnique({ where: { id: params.requestId }, select: { title: true } })
    .catch(() => null);
  const requesteeName = await userName(params.requesteeUserId);
  const title = er?.title ?? "an evidence request";
  await emitNotification({
    recipientUserId: params.requesterUserId,
    type: NOTIFICATION_TYPE.EVIDENCE_SUBMITTED,
    entityType: NOTIFICATION_ENTITY_EVIDENCE_REQUEST,
    entityId: params.requestId,
    title: "Evidence submitted",
    body: `${requesteeName} submitted evidence for “${title}”`,
    companyId: params.companyId,
  });
}

/** EvidenceReviewed — to the requestee (on accept or reject). */
export async function emitEvidenceReviewed(params: {
  requestId: string;
  requesteeUserId: string;
  status: "Accepted" | "Rejected";
  reviewNote?: string | null;
  companyId?: string | null;
}): Promise<void> {
  const er = await prisma.evidenceRequest
    .findUnique({ where: { id: params.requestId }, select: { title: true } })
    .catch(() => null);
  const title = er?.title ?? "an evidence request";
  const verdict = params.status === "Accepted" ? "accepted" : "rejected";
  const note = params.reviewNote ? ` — ${params.reviewNote.slice(0, 120)}` : "";
  await emitNotification({
    recipientUserId: params.requesteeUserId,
    type: NOTIFICATION_TYPE.EVIDENCE_REVIEWED,
    entityType: NOTIFICATION_ENTITY_EVIDENCE_REQUEST,
    entityId: params.requestId,
    title: `Evidence ${verdict}`,
    body: `Your evidence for “${title}” was ${verdict}${note}`,
    companyId: params.companyId,
  });
}

/**
 * CommentShared — to the entity participants (a finding's assessment assessor /
 * request participants), excluding the author. Resolves participants, then
 * emits one notification per recipient. Never throws.
 */
export async function notifyCommentShared(params: {
  entityType: string;
  entityId: string;
  authorUserId: string;
  companyId?: string | null;
  body: string;
}): Promise<void> {
  try {
    const recipientIds = new Set<string>();
    if (params.entityType === NOTIFICATION_ENTITY_FINDING) {
      const finding = await prisma.finding.findUnique({
        where: { id: params.entityId },
        select: { assessmentId: true },
      });
      if (finding) {
        const assessment = await prisma.assessment.findUnique({
          where: { id: finding.assessmentId },
          select: { assessorId: true, assessorLinks: { select: { userId: true } } },
        });
        if (assessment) {
          if (assessment.assessorId) recipientIds.add(assessment.assessorId);
          for (const link of assessment.assessorLinks) recipientIds.add(link.userId);
        }
      }
    } else if (params.entityType === NOTIFICATION_ENTITY_EVIDENCE_REQUEST) {
      const er = await prisma.evidenceRequest.findUnique({
        where: { id: params.entityId },
        select: { requestedByUserId: true, requestedFromUserId: true },
      });
      if (er) {
        recipientIds.add(er.requestedByUserId);
        recipientIds.add(er.requestedFromUserId);
      }
    }
    recipientIds.delete(params.authorUserId);

    const authorName = await userName(params.authorUserId);
    const summary = params.body.length > 80 ? `${params.body.slice(0, 80)}…` : params.body;
    const entityLabel = params.entityType === NOTIFICATION_ENTITY_FINDING ? "a finding" : "an evidence request";
    for (const recipientId of recipientIds) {
      await emitNotification({
        recipientUserId: recipientId,
        type: NOTIFICATION_TYPE.COMMENT_SHARED,
        entityType: params.entityType,
        entityId: params.entityId,
        title: `Comment shared on ${entityLabel}`,
        body: `${authorName} shared a comment: ${summary}`,
        companyId: params.companyId,
      });
    }
  } catch (e) {
    console.error("[notifications] CommentShared emission failed:", e);
  }
}

/* ── Read side ───────────────────────────────────────────────────────────── */

/** The company the user operates in for the company-scoped overdue banner. */
export async function resolveNotificationCompanyId(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, userCompanies: { select: { companyId: true } } },
    });
    if (!user) return null;
    if (user.companyId) return user.companyId;
    const mapped = user.userCompanies.map((uc) => uc.companyId).filter(Boolean) as string[];
    return mapped.length === 1 ? mapped[0] : (mapped[0] ?? null);
  } catch {
    return null;
  }
}

/** Overdue actions for a company (targetDate < now AND closureDate null). */
export async function countOverdueActions(companyId: string | null): Promise<number> {
  if (!companyId) return 0;
  const now = new Date();
  return prisma.action.count({
    where: { finding: { assessment: { companyId } }, closureDate: null, targetDate: { lt: now } },
  });
}

/**
 * Deep-link resolution at READ time. A Notification stores only entityType +
 * entityId (no assessmentId, no role), so we resolve the correct surface here
 * — for an EvidenceRequest, a requestee lands on their submit hub, a requester
 * lands on the assessment's evidence tab.
 */
export async function resolveNotificationHrefs<T extends { entityType: string; entityId: string }>(
  rows: T[],
  userId: string
): Promise<Map<string, string>> {
  const href = new Map<string, string>();
  const erIds = rows.filter((r) => r.entityType === NOTIFICATION_ENTITY_EVIDENCE_REQUEST).map((r) => r.entityId);
  const findingIds = rows.filter((r) => r.entityType === NOTIFICATION_ENTITY_FINDING).map((r) => r.entityId);

  if (erIds.length) {
    const ers = await prisma.evidenceRequest.findMany({
      where: { id: { in: erIds } },
      select: { id: true, requestedFromUserId: true, assessmentId: true },
    });
    for (const er of ers) {
      href.set(er.id, er.requestedFromUserId === userId ? "/fla/my-evidence-requests" : er.assessmentId ? `/fla/${er.assessmentId}` : "/fla/my-evidence-requests");
    }
  }
  if (findingIds.length) {
    const findings = await prisma.finding.findMany({
      where: { id: { in: findingIds } },
      select: { id: true, assessmentId: true },
    });
    for (const f of findings) href.set(f.id, f.assessmentId ? `/fla/${f.assessmentId}` : "/portal/findings");
  }
  return href;
}
