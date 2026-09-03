import { prisma } from "@/lib/prisma";
import { requireAuth, hasCompanyAccess } from "@/lib/authz";
import { sessionUserId } from "@/lib/conversation";
import { logActivity } from "@/lib/activity-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Max length for a client management response (spec: ≤2000). */
const MANAGEMENT_RESPONSE_MAX = 2000;

/**
 * POST /api/portal/findings/[id]/management-response
 *
 * The ONLY portal write (settled decision #5): a client management response on
 * a finding. Settled decision #3:
 *   - editable by client Assessor+ roles (Admin/Superuser/Assessor) OF THAT
 *     COMPANY; Interviewee → 403.
 *   - stamps managementResponse (≤2000) / managementResponseAt /
 *     managementResponseById on save.
 *   - an empty body CLEARS the response (nullable, additive — no backfill).
 *   - >2000 chars → 422.
 * Scope is enforced by construction: the finding's company must be one the
 * caller may access.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const { id } = await params;
  const userId = sessionUserId(session) || "";
  const role = (session.user as { role?: string })?.role ?? "";

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.managementResponse === "string" ? body.managementResponse.trim() : "";

  if (text.length > MANAGEMENT_RESPONSE_MAX) {
    return NextResponse.json(
      { error: `Management response must be ≤ ${MANAGEMENT_RESPONSE_MAX} characters` },
      { status: 422 }
    );
  }

  const finding = await prisma.finding.findUnique({
    where: { id },
    select: { id: true, assessment: { select: { companyId: true } } },
  });
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }
  const companyId = finding.assessment?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "Finding has no owning company" }, { status: 404 });
  }

  // Client Assessor+ roles of that company only. Interviewee → 403.
  const isAssessorRole = role === "Admin" || role === "Superuser" || role === "Assessor";
  if (!isAssessorRole) {
    return NextResponse.json({ error: "Assessor+ access required to manage a response" }, { status: 403 });
  }
  const ok = await hasCompanyAccess(userId, companyId);
  if (!ok) {
    return NextResponse.json({ error: "Access denied for company" }, { status: 403 });
  }

  try {
    const updated = await prisma.finding.update({
      where: { id },
      data: text
        ? {
            managementResponse: text,
            managementResponseAt: new Date(),
            managementResponseById: userId,
          }
        : {
            managementResponse: null,
            managementResponseAt: null,
            managementResponseById: null,
          },
      include: {
        assessment: { select: { id: true, name: true } },
        managementResponseBy: { select: { id: true, name: true, username: true } },
      },
    });

    // Preserve the audit trail (regression posture: protect data + audit trail).
    await logActivity({
      activityType: "MANAGEMENT_RESPONSE_SAVE",
      description: `${session.user?.name ?? userId} saved a management response on finding ${id}`,
      username: session.user?.name ?? userId,
      refTable: "Finding",
      refRecord: id,
      beforeData: null,
      afterData: {
        companyId,
        managementResponsePresent: !!text,
        managementResponseAt: updated.managementResponseAt ?? null,
        managementResponseById: updated.managementResponseById ?? null,
      },
    });

    return NextResponse.json({
      finding: {
        id: updated.id,
        managementResponse: updated.managementResponse,
        managementResponseAt: updated.managementResponseAt,
        managementResponseById: updated.managementResponseById,
        managementResponseBy: updated.managementResponseBy
          ? { id: updated.managementResponseBy.id, name: updated.managementResponseBy.name, username: updated.managementResponseBy.username }
          : null,
        updatedAt: new Date().toISOString(),
      },
      // Audit-friendly echo (never store secrets; the response is client data).
      _audit: { action: "MANAGEMENT_RESPONSE_SAVE", findingId: id, companyId, byUserId: userId, at: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Error saving management response:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
