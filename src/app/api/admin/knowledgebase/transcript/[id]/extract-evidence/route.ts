import { NextResponse } from "next/server";
import { requireAssessor, requireCompanyIdAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { runExtraction, type ChecklistItemInput } from "@/lib/evidence-extraction";

/**
 * POST /api/admin/knowledgebase/transcript/[id]/extract-evidence
 *
 * SAMS-013 — on-demand extraction ("Extract evidence"). Runs the DeepSeek
 * pipeline over a transcript against a target assessment's checklist items and
 * writes one ExtractionProposal per evidence-claim (status=Proposed). NOTHING
 * links while proposed.
 *
 * Scoped by construction: the request must name a companyId the session user
 * can access; the transcript AND the assessment must both belong to that exact
 * company, and only that company's checklist items are ever fed to the
 * extractor.
 *
 * Body: { companyId, assessmentId }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, response } = await requireAssessor();
    if (response) return response;
    const userId = (session.user as { id?: string }).id || "unknown";

    const { id: knowledgebaseId } = await params;
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const companyId = (body.companyId as string) || "";
    const assessmentId = (body.assessmentId as string) || "";

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }
    if (!assessmentId) {
      return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
    }

    const access = await requireCompanyIdAccess(session.user, companyId);
    if (access.response) return access.response;

    const transcript = await prisma.knowledgebase.findUnique({
      where: { kID: knowledgebaseId },
      select: { kID: true, knowledgeName: true, knowledgeContent: true, companyId: true, entryType: true },
    });
    if (!transcript || transcript.entryType !== "Transcript") {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }
    if (transcript.companyId !== companyId) {
      return NextResponse.json({ error: "Transcript does not belong to this company" }, { status: 403 });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, companyId: true },
    });
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }
    if (assessment.companyId !== companyId) {
      return NextResponse.json({ error: "Assessment does not belong to this company" }, { status: 403 });
    }

    const checklist = await prisma.auditChecklistItem.findMany({
      where: { assessmentId },
      select: {
        id: true,
        checklistItemId: true,
        checklistText: true,
        auditStandard: true,
        evidenceRequirements: true,
        whatGoodLooksLike: true,
        controlPoints: true,
        keyQuestions: true,
      },
      orderBy: [{ auditStandard: "asc" }, { sortOrder: "asc" }],
    });

    if (checklist.length === 0) {
      return NextResponse.json({ error: "This assessment has no checklist items to extract against" }, { status: 422 });
    }

    const checklistItems: ChecklistItemInput[] = checklist.map((c) => ({
      id: c.id,
      checklistItemId: c.checklistItemId,
      checklistText: c.checklistText,
      auditStandard: c.auditStandard,
      evidenceRequirements: c.evidenceRequirements,
      whatGoodLooksLike: c.whatGoodLooksLike,
      controlPoints: c.controlPoints,
      keyQuestions: c.keyQuestions,
    }));

    const proposals = await runExtraction(
      { title: transcript.knowledgeName, content: transcript.knowledgeContent },
      checklistItems,
      {
        knowledgebaseId: transcript.kID,
        assessmentId,
        companyId,
        userId,
        transcriptTitle: transcript.knowledgeName,
      }
    );

    return NextResponse.json({ proposals, count: proposals.length });
  } catch (err: any) {
    console.error("[extract-evidence] Error:", err);
    const code = err?.code as string | undefined;
    if (code === "EVIDENCE_NO_API_KEY") {
      return NextResponse.json({ error: "DeepSeek API key is not configured. Extraction requires DEEPSEEK_API_KEY." }, { status: 503 });
    }
    if (code === "EVIDENCE_AI_ERROR") {
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
