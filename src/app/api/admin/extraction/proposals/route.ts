import { NextResponse } from "next/server";
import { requireAssessor, requireCompanyIdAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/extraction/proposals?companyId=&assessmentId=&transcriptId=&status=
 *
 * SAMS-013 — review list. Returns ExtractionProposals scoped to the session
 * user's company (companyId is required and access-checked), optionally filtered
 * by assessment / transcript / status. Enriched with the target checklist item
 * and source transcript so the review groups by checklist item.
 *
 * Cancellation: by default returns ONLY status=Proposed (the unreviewed queue).
 * Pass status=all to include confirmed/rejected (used to show where a proposal
 * landed). Rejected proposals are never surfaced in the review queue.
 */
export async function GET(request: Request) {
  try {
    const { session, response } = await requireAssessor();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId") || "";
    const assessmentId = searchParams.get("assessmentId") || undefined;
    const transcriptId = searchParams.get("transcriptId") || undefined;
    const statusParam = searchParams.get("status") || "Proposed";

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }
    const access = await requireCompanyIdAccess(session.user, companyId);
    if (access.response) return access.response;

    const status =
      statusParam === "all" ? undefined : (statusParam as "Proposed" | "Confirmed" | "Rejected" | undefined);

    const rows = await prisma.extractionProposal.findMany({
      where: {
        companyId,
        ...(assessmentId ? { assessmentId } : {}),
        ...(transcriptId ? { knowledgebaseId: transcriptId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        auditChecklistItem: { select: { id: true, checklistItemId: true, checklistText: true, auditStandard: true } },
        knowledgebase: { select: { knowledgeName: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    // Fetch attesters' names (stored as scalar userIds — no FK relation).
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.proposedByUserId) ids.add(r.proposedByUserId);
      if (r.confirmedByUserId) ids.add(r.confirmedByUserId);
      if (r.rejectedByUserId) ids.add(r.rejectedByUserId);
    }
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        assessmentId: r.assessmentId,
        transcriptId: r.knowledgebaseId,
        transcriptTitle: r.transcriptTitle ?? r.knowledgebase?.knowledgeName,
        companyId: r.companyId,
        spanStart: r.spanStart,
        spanEnd: r.spanEnd,
        evidenceExcerpt: r.evidenceExcerpt,
        suggestedAction: r.suggestedAction,
        proposedBy: r.proposedBy,
        proposedByUserId: r.proposedByUserId,
        proposedByName: r.proposedByUserId ? nameById.get(r.proposedByUserId) ?? null : null,
        confirmedByUserId: r.confirmedByUserId,
        confirmedByName: r.confirmedByUserId ? nameById.get(r.confirmedByUserId) ?? null : null,
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        rejectedByUserId: r.rejectedByUserId,
        rejectedByName: r.rejectedByUserId ? nameById.get(r.rejectedByUserId) ?? null : null,
        rejectedAt: r.rejectedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        checklistItem: r.auditChecklistItem
          ? {
              id: r.auditChecklistItem.id,
              checklistItemId: r.auditChecklistItem.checklistItemId,
              checklistText: r.auditChecklistItem.checklistText,
              auditStandard: r.auditChecklistItem.auditStandard,
            }
          : null,
      }))
    );
  } catch (err: any) {
    console.error("[extraction/proposals/list] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
