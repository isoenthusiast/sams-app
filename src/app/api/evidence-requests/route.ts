import { prisma } from "@/lib/prisma";
import { requireAuth, requireAssessorOrProvider, hasCompanyAccess, getSelectedCompanyId } from "@/lib/authz";
import { logActivity } from "@/lib/activity-log";
import { sessionPlane, sessionUserId, sessionName, EVIDENCE_REQUEST_STATUS } from "@/lib/conversation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/evidence-requests
 * Create an EvidenceRequest (DRL unit) starting in `Draft`. Assessor/provider
 * only. `requestedFromUserId` is the requestee who will `send`/`submit`.
 * Sets companyId from the target assessment (or a passed companyId) and writes
 * an EVIDENCE_REQUEST_CREATED ActivityLog row.
 */
export async function POST(request: Request) {
  const { session, response } = await requireAssessorOrProvider();
  if (response) return response;

  const userId = sessionUserId(session) || "";
  const username = sessionName(session);
  const plane = sessionPlane(session);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, instructions, requestedFromUserId, assessmentId, requirementRId, controlId, dueDate } = body;

  if (!title || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!instructions || !instructions.trim()) {
    return NextResponse.json({ error: "instructions are required" }, { status: 400 });
  }
  if (title.trim().length > 200) {
    return NextResponse.json({ error: "title must be ≤ 200 characters" }, { status: 400 });
  }
  if (instructions.trim().length > 2000) {
    return NextResponse.json({ error: "instructions must be ≤ 2000 characters" }, { status: 400 });
  }
  if (!requestedFromUserId) {
    return NextResponse.json({ error: "requestedFromUserId is required" }, { status: 400 });
  }

  // Resolve the target company: prefer the assessment's company, else an explicit
  // companyId, else the caller's selected company.
  let companyId: string | null = body.companyId ?? null;
  if (assessmentId) {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { companyId: true },
    });
    if (assessment?.companyId) companyId = assessment.companyId;
  }
  if (!companyId) {
    const selected = await getSelectedCompanyId();
    companyId = selected ?? null;
  }
  if (!companyId) {
    return NextResponse.json({ error: "Unable to resolve target company" }, { status: 400 });
  }

  // Cross-company gate: an assessor must hold access to the target company
  // (provider staff may create for any company).
  if (plane !== "Provider") {
    const ok = await hasCompanyAccess(userId, companyId);
    if (!ok) {
      return NextResponse.json({ error: "Access denied for company" }, { status: 403 });
    }
  }

  // Validate the requestee belongs to the target company. Enforced for EVERYONE
  // (provider included) — a mistyped username must fail loud, never leak another
  // company's title/instructions/assessment into a requestee's ?mine=1 inbox.
  const requestee = await prisma.user.findUnique({
    where: { id: requestedFromUserId },
    select: { id: true, companyId: true, userCompanies: { select: { companyId: true } } },
  });
  if (!requestee) {
    return NextResponse.json({ error: "requestedFromUserId not found" }, { status: 400 });
  }
  const requesteeCompanies = new Set<string>();
  if (requestee.companyId) requesteeCompanies.add(requestee.companyId);
  for (const uc of requestee.userCompanies) if (uc.companyId) requesteeCompanies.add(uc.companyId);
  if (!requesteeCompanies.has(companyId)) {
    return NextResponse.json(
      { error: "requestedFromUserId does not belong to the target company" },
      { status: 400 }
    );
  }

  try {
    const proof = await prisma.evidenceRequest.create({
      data: {
        companyId,
        assessmentId: assessmentId ?? null,
        requirementRId: typeof requirementRId === "number" ? requirementRId : null,
        controlId: controlId || null,
        title: title.trim(),
        instructions: instructions.trim(),
        requestedByUserId: userId,
        requestedFromUserId,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: EVIDENCE_REQUEST_STATUS.DRAFT,
      },
    });

    await logActivity({
      activityType: "EVIDENCE_REQUEST_CREATED",
      description: `${username} created evidence request "${title.trim().slice(0, 80)}" for ${requestee.id}`,
      username,
      refTable: "EvidenceRequest",
      refRecord: proof.id,
      beforeData: null,
      afterData: { title: title.trim(), requestedFromUserId, companyId, status: "Draft" },
    });

    return NextResponse.json({ evidenceRequest: proof }, { status: 201 });
  } catch (error) {
    console.error("Error creating evidence request:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/evidence-requests?mine=1
 * Role-scoped listing (settled decision #4):
 *   - `?mine=1` → the caller's OWN requests (any status); any authenticated user.
 *   - without `?mine=1` → all company requests; assessor/provider only.
 * Cross-company listing is scoped to the caller's selected company.
 */
export async function GET(request: Request) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine") === "1";
  const userId = sessionUserId(session) || "";
  const plane = sessionPlane(session);

  const include = {
    requestedBy: { select: { id: true, name: true, username: true } },
    requestedFrom: { select: { id: true, name: true, username: true } },
    assessment: { select: { id: true, name: true, companyId: true } },
  };

  try {
    if (mine) {
      // A requestee sees only their own requests (any status).
      const rows = await prisma.evidenceRequest.findMany({
        where: { requestedFromUserId: userId },
        include,
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ mine: true, evidenceRequests: rows });
    }

    // Not mine → assessor/provider listing. Scope to the caller's company:
    // provider staff may list any company (via selected cookie or all); an
    // assessor is restricted to their own company (never a cross-tenant leak).
    const { response: gateResponse } = await requireAssessorOrProvider();
    if (gateResponse) return gateResponse;

    let companyId: string | null = await getSelectedCompanyId();
    if (plane !== "Provider") {
      // Root the assessor's listing in their own company; if the selected cookie
      // points elsewhere, fall back to the session user's company. No company →
      // empty (never a cross-tenant leak).
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true, userCompanies: { select: { companyId: true } } },
      });
      const myCompanies = new Set<string>();
      if (me?.companyId) myCompanies.add(me.companyId);
      for (const uc of me?.userCompanies ?? []) if (uc.companyId) myCompanies.add(uc.companyId);
      const allowed = Array.from(myCompanies);
      if (companyId && !allowed.includes(companyId)) companyId = null;
      if (!companyId) {
        // No selected company → if the user belongs to exactly one, use it; else
        // return empty (least privilege).
        companyId = allowed.length === 1 ? allowed[0] : null;
      }
    }

    const rows = await prisma.evidenceRequest.findMany({
      where: companyId ? { companyId } : { companyId: "__NO_ACCESS__" },
      include,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ mine: false, evidenceRequests: rows });
  } catch (error) {
    console.error("Error listing evidence requests:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
