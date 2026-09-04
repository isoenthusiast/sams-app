import { NextResponse } from "next/server";
import { requireAssessor, requireCompanyIdAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { confirmProposal, rejectProposal } from "@/lib/evidence-confirm";

/**
 * PATCH /api/admin/extraction/proposals/[id]
 *
 * SAMS-013 — review verdict on one evidence proposal.
 * Body: { verdict: "confirm"|"reject", evidenceExcerpt? }
 *   - confirm → link evidence (attachment on the checklist-item audit module)
 *     + draft Action (if the proposal carried a suggested action). Optionally
 *     edits the evidence excerpt before linking.
 *   - reject → recorded (status + user + timestamp), never resurfaced.
 * Scope-by-construction: the proposal is loaded and the checklist item /
 * assessment / transcript / company are all validated to belong to the session
 * user's company.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireAssessor();
    if (response) return response;
    const userId = (session.user as { id?: string }).id || "unknown";
    const userName = (session.user as { name?: string }).name || userId;

    const { id: proposalId } = await params;
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const verdict = body.verdict as "confirm" | "reject" | undefined;
    const evidenceExcerptOverride = (body.evidenceExcerpt as string | null | undefined) ?? null;

    const proposal = await prisma.extractionProposal.findUnique({
      where: { id: proposalId },
      include: { knowledgebase: { select: { knowledgeName: true } } },
    });
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Scope: the proposal's company must be one the session user can access.
    const access = await requireCompanyIdAccess(session.user, proposal.companyId);
    if (access.response) return access.response;

    if (verdict !== "confirm" && verdict !== "reject") {
      return NextResponse.json({ error: "verdict must be 'confirm' or 'reject'" }, { status: 400 });
    }

    if (verdict === "confirm") {
      const outcome = await confirmProposal(proposalId, {
        userId,
        userName,
        transcriptTitle: proposal.transcriptTitle ?? proposal.knowledgebase?.knowledgeName,
        evidenceExcerptOverride,
      });
      return NextResponse.json(outcome);
    }

    const outcome = await rejectProposal(proposalId, { userId, userName });
    return NextResponse.json(outcome);
  } catch (err: any) {
    console.error("[extraction/proposals/patch] Error:", err);
    if (/reject/i.test(err?.message || "")) return NextResponse.json({ error: err.message }, { status: 409 });
    if (/not found/i.test(err?.message || "")) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
