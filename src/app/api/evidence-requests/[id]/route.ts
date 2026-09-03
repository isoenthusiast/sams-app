import { prisma } from "@/lib/prisma";
import { requireAuth, requireAssessorOrProvider, hasCompanyAccess } from "@/lib/authz";
import { logActivity } from "@/lib/activity-log";
import { sessionPlane, sessionUserId, sessionName, allowedTransition, canTakeAction } from "@/lib/conversation";
import { emitEvidenceRequested, emitEvidenceSubmitted, emitEvidenceReviewed } from "@/lib/notifications";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/evidence-requests/[id]
 * Drive the DRL state machine (settled decision #4):
 *   Draft→Requested:      { action: 'send' }                  (assessor/provider)
 *   Requested→Submitted:  { action: 'submit', submittedNote } (requestee)
 *   Requested→Accepted:   { action: 'accept' }                (assessor/provider)
 *   Requested→Rejected:   { action: 'reject', reviewNote }    (assessor/provider)
 *   Requested→NotApplicable:{ action: 'na' }                  (assessor/provider)
 *   Submitted→Accepted/Rejected (assessor/provider)
 *   Rejected→Submitted:   { action: 'submit', submittedNote } (requestee, resubmit)
 * Invalid transitions → 409. `submit` with neither a note nor an attachment →
 * 422. Every transition writes an EVIDENCE_REQUEST_STATUS ActivityLog row with
 * before/after status. Requestee can only act on their OWN request (403); the
 * requestee is never authorized to accept/reject/na; an assessor/provider can
 * never `submit` (only the requestee can).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const { id } = await params;
  const userId = sessionUserId(session) || "";
  const username = sessionName(session);
  const plane = sessionPlane(session);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const current = await prisma.evidenceRequest.findUnique({
    where: { id },
    select: { id: true, status: true, requestedFromUserId: true, requestedByUserId: true, title: true, assessmentId: true, companyId: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Evidence request not found" }, { status: 404 });
  }

  // ── Role / authorization ───────────────────────────────────────────────────
  // Assessor/provider credential (for send/accept/reject/na). The requestee may
  // be an Interviewee, so we do NOT hard-require assessor creds globally — we
  // check them only when the action demands them.
  let isAssessorOrProvider = false;
  if (plane === "Provider") {
    isAssessorOrProvider = true;
  } else {
    const { response: ar } = await requireAssessorOrProvider();
    if (!ar) isAssessorOrProvider = true;
  }

  if (!canTakeAction(action, userId, current.requestedFromUserId, isAssessorOrProvider)) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  // Assessor/provider cross-company gate for the assessor actions.
  if (action !== "submit" && current.companyId && plane !== "Provider") {
    const ok = await hasCompanyAccess(userId, current.companyId);
    if (!ok) {
      return NextResponse.json({ error: "Access denied for company" }, { status: 403 });
    }
  }

  // ── State machine ───────────────────────────────────────────────────────────
  const nextStatus = allowedTransition(current.status, action);
  if (!nextStatus) {
    return NextResponse.json(
      { error: `Invalid transition: ${current.status} + ${action}` },
      { status: 409 }
    );
  }

  // Submit requires a note OR an attachment (settled decision / AC).
  if (action === "submit") {
    const submittedNote: string = body.submittedNote?.trim() ?? "";
    const attachmentCount = await prisma.attachmentMapping.count({
      where: { destTable: "EvidenceRequest", recId: id },
    });
    if (!submittedNote && attachmentCount === 0) {
      return NextResponse.json(
        { error: "Submit requires a note or an attachment" },
        { status: 422 }
      );
    }
  }

  const now = new Date();

  try {
    const updated = await prisma.evidenceRequest.update({
      where: { id },
      data: {
        status: nextStatus as any,
        ...(action === "submit"
          ? { submittedNote: body.submittedNote?.trim() || null, submittedAt: now, reviewNote: null }
          : {}),
        ...(action === "reject" ? { reviewNote: body.reviewNote?.trim() || null, reviewedAt: now } : {}),
        ...(action === "accept" ? { reviewedAt: now } : {}),
      },
    });

    await logActivity({
      activityType: "EVIDENCE_REQUEST_STATUS",
      description: `${username} transitioned evidence request ${id} from ${current.status} to ${nextStatus}`,
      username,
      refTable: "EvidenceRequest",
      refRecord: id,
      beforeData: { status: current.status },
      afterData: { status: nextStatus },
    });

    // ── In-App Notifications (SAMS-006) ─────────────────────────────────────
    // Emission is fired-and-forgotten. Every emitter is internally guarded
    // (emitNotification / userName NEVER throw) and this call-site is ALSO
    // wrapped, so a notification failure can NEVER fail the parent state
    // transition (settled decision #4) — proven by fault-injection in the
    // owner test plan (c): a broken pre-emission query (userName) or a broken
    // Notification write both leave the PATCH at 200 + Requested.
    try {
      if (nextStatus === "Requested") {
        await emitEvidenceRequested({
          requestId: id,
          requesteeUserId: current.requestedFromUserId,
          requesterUserId: current.requestedByUserId,
          companyId: current.companyId,
        });
      } else if (nextStatus === "Submitted") {
        await emitEvidenceSubmitted({
          requestId: id,
          requesterUserId: current.requestedByUserId,
          requesteeUserId: current.requestedFromUserId,
          companyId: current.companyId,
        });
      } else if (nextStatus === "Accepted" || nextStatus === "Rejected") {
        await emitEvidenceReviewed({
          requestId: id,
          requesteeUserId: current.requestedFromUserId,
          status: nextStatus as "Accepted" | "Rejected",
          reviewNote: body.reviewNote,
          companyId: current.companyId,
        });
      }
    } catch (e) {
      // Belt-and-suspenders: even if a future emitter path throws, the parent
      // write already committed — swallow so the transition response is 200.
      console.error("[notifications] post-transition emission failed (parent write already committed):", e);
    }

    return NextResponse.json({ evidenceRequest: updated });
  } catch (error) {
    console.error("Error updating evidence request:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
