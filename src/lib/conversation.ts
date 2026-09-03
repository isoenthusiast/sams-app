import { prisma } from "@/lib/prisma";
import { isProvider } from "@/lib/authz";

// Evidence uses the EXISTING polymorphic attachment system with destTable =
// 'EvidenceRequest' (settled decision #4). Finding is the other v1 entityType.
export const COMMENT_ENTITY_FINDING = "Finding";
export const COMMENT_ENTITY_EVIDENCE_REQUEST = "EvidenceRequest";

export const EVIDENCE_REQUEST_TABLE = "EvidenceRequest";

/* ── Session / author plane ------------------------------------------------ */

export type Plane = "Provider" | "Client";

/**
 * Derive the author plane from the session, NEVER client-supplied (settled
 * decision #2). providerRole set → Provider staff; otherwise Client.
 */
export function sessionPlane(session: { user?: object } | null): Plane {
  return isProvider(session) ? "Provider" : "Client";
}

/** The session user id for an authenticated session. */
export function sessionUserId(session: { user?: object } | null): string | undefined {
  return (session?.user as { id?: string })?.id;
}

/** The session username (or the id as fallback). */
export function sessionName(session: { user?: object } | null): string {
  const user = session?.user as { name?: string; id?: string } | undefined;
  return user?.name || user?.id || "Unknown";
}

/* ── Comment target resolution --------------------------------------------- */

export type CommentTarget = {
  exists: boolean;
  companyId: string | null;
};

/**
 * Resolve a polymorphic comment target's owning company. For `Finding` this
 * traverses the Assessment (Findings have no direct companyId); for
 * `EvidenceRequest` it's the row's own companyId. Used for the cross-company
 * access gate and for scoping.
 */
export async function resolveCommentTarget(entityType: string, entityId: string): Promise<CommentTarget> {
  if (entityType === COMMENT_ENTITY_FINDING) {
    const finding = await prisma.finding.findUnique({
      where: { id: entityId },
      select: { id: true, assessment: { select: { companyId: true } } },
    });
    if (!finding) return { exists: false, companyId: null };
    return { exists: true, companyId: finding.assessment?.companyId ?? null };
  }
  if (entityType === COMMENT_ENTITY_EVIDENCE_REQUEST) {
    const req = await prisma.evidenceRequest.findUnique({
      where: { id: entityId },
      select: { id: true, companyId: true },
    });
    if (!req) return { exists: false, companyId: null };
    return { exists: true, companyId: req.companyId };
  }
  return { exists: false, companyId: null };
}

/* ── Visibility rules (settled decision #2) -------------------------------- */

/**
 * Filter predicate for the thread list, enforced server-side in EVERY list
 * query. Provider-plane sessions see everything; client sessions see
 * client-authored comments plus provider comments that are SharedWithClient —
 * never provider-Internal.
 */
export function clientVisibleWhere() {
  return {
    OR: [{ authorPlane: "Client" }, { visibility: "SharedWithClient" }],
  };
}

export const COMMENT_BODY_MAX = 4000;

/* ── EvidenceRequest state machine (settled decision #4) ------------------- */

export const EVIDENCE_REQUEST_STATUS = {
  DRAFT: "Draft",
  REQUESTED: "Requested",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  NOT_APPLICABLE: "NotApplicable",
} as const;

export type EvidenceRequestStatusValue = (typeof EVIDENCE_REQUEST_STATUS)[keyof typeof EVIDENCE_REQUEST_STATUS];

const TRANSITIONS: Record<string, Record<string, string>> = {
  Draft: { send: "Requested" },
  Requested: {
    submit: "Submitted",
    accept: "Accepted",
    reject: "Rejected",
    na: "NotApplicable",
  },
  Submitted: {
    accept: "Accepted",
    reject: "Rejected",
  },
  Rejected: {
    submit: "Submitted",
    accept: "Accepted",
    na: "NotApplicable",
  },
  Accepted: {},
  NotApplicable: {},
};

export function allowedTransition(from: string, action: string): string | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

export function isValidTargetStatus(status: string): status is EvidenceRequestStatusValue {
  return Object.values(EVIDENCE_REQUEST_STATUS).includes(status as EvidenceRequestStatusValue);
}

/**
 * Whether a caller may drive this transition. Requestee (the requestedFrom
 * user) may only `submit`; assessor/provider may only `send`/`accept`/`reject`/
 * `na`. Returns 'forbidden' if the caller has no authority over this action.
 */
export type TransitionRole = "requestee" | "assessor";
export function canTakeAction(
  action: string,
  callerUserId: string,
  requestedFromUserId: string,
  callerIsAssessorOrProvider: boolean
): boolean {
  if (action === "submit") {
    // submit is a requestee action; the requestee is always the submitter.
    return callerUserId === requestedFromUserId;
  }
  // send/accept/reject/na are assessor/provider actions.
  return callerIsAssessorOrProvider;
}
