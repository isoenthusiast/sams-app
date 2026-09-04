import { NextResponse } from "next/server";
import { requireAssessor, requireCompanyIdAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { confirmProposal } from "@/lib/evidence-confirm";

/**
 * POST /api/admin/extraction/proposals/bulk-confirm
 *
 * SAMS-013 — optional bulk-confirm of reviewed proposals.
 * Body: { companyId, ids: string[], evidenceOverrides?: Record<id, excerpt> }
 * Every id is confirmed with the same semantics as the per-item PATCH. Only
 * PROPOSED proposals are actionable (already-decided ones return their current
 * state). Scope-by-construction: companyId is access-checked and every loaded
 * proposal must belong to it.
 */
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAssessor();
    if (response) return response;
    const userId = (session.user as { id?: string }).id || "unknown";
    const userName = (session.user as { name?: string }).name || userId;

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const companyId = (body.companyId as string) || "";
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    const overrides = (body.evidenceOverrides as Record<string, string> | undefined) ?? {};

    if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
    if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const access = await requireCompanyIdAccess(session.user, companyId);
    if (access.response) return access.response;

    const proposals = await prisma.extractionProposal.findMany({
      where: { id: { in: ids }, companyId },
      include: { knowledgebase: { select: { knowledgeName: true } } },
    });

    const results: Array<{ id: string; status: string; error?: string }> = [];
    for (const proposal of proposals) {
      try {
        const outcome = await confirmProposal(proposal.id, {
          userId,
          userName,
          transcriptTitle: proposal.transcriptTitle ?? proposal.knowledgebase?.knowledgeName,
          evidenceExcerptOverride: overrides[proposal.id] ?? null,
        });
        results.push({ id: proposal.id, status: outcome.status });
      } catch (e: any) {
        results.push({ id: proposal.id, status: "error", error: e?.message || "unknown" });
      }
    }

    return NextResponse.json({ results, confirmed: results.filter((r) => r.status === "Confirmed").length });
  } catch (err: any) {
    console.error("[extraction/proposals/bulk-confirm] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
