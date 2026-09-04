import { prisma } from "@/lib/prisma";
import { requireAssessor } from "@/lib/authz";
import { logActivity } from "@/lib/activity-log";
import { computePaSocSnapshot, hasMicCompanyAccess, getPaAttestationStatus } from "@/lib/mic-attestations";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PERIOD_MAX = 200;

/**
 * GET /api/admin/processareas/[id]/attest   (preview — SAMS-014)
 * Read-only SERVER-COMPUTED SOC snapshot + derived attestation state for a PA,
 * used by the attest modal to review before signing. Same gate as POST.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAssessor();
  if (response) return response;

  const { id } = await params;
  const userId = (session.user as { id?: string })?.id ?? "";

  const pa = await prisma.processArea.findUnique({
    where: { id },
    select: { id: true, name: true, companyId: true },
  });
  if (!pa) return NextResponse.json({ error: "Process area not found" }, { status: 404 });
  if (!pa.companyId) return NextResponse.json({ error: "Process area has no owning company" }, { status: 404 });

  const ok = await hasMicCompanyAccess(userId, pa.companyId);
  if (!ok) return NextResponse.json({ error: "Access denied for company" }, { status: 403 });

  const [snapshot, status] = await Promise.all([
    computePaSocSnapshot(pa.id, pa.companyId),
    getPaAttestationStatus(pa.id, pa.companyId),
  ]);

  return NextResponse.json({ processArea: { id: pa.id, name: pa.name }, snapshot, attestationStatus: status });
}

/**
 * POST /api/admin/processareas/[id]/attest   (SAMS-014, Phase 4 Feature B)
 *
 * Sign a quarterly SOC attestation for a process area. The SPO (client
 * Admin/Superuser/Assessor OF THAT COMPANY) reviews the SERVER-COMPUTED snapshot,
 * then signs — recording a `MicAttestation` + an `ActivityLog` audit row.
 *
 * GATE (settled decision): role Admin/Superuser/Assessor AND MIC company access
 * (`hasMicCompanyAccess` — the SPO must be a MEMBER of the PA's company; stricter
 * than authz.hasCompanyAccess so cross-tenant 403 holds for every role incl. Admin).
 *
 * SECURITY (negative path): the `socSnapshot` is computed SERVER-SIDE here and the
 * client-supplied value is NEVER read — a tampered snapshot is ignored/overwritten.
 * SOFT enforcement: nothing here gates any other action (overdue merely surfaces).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAssessor();
  if (response) return response;

  const { id } = await params;
  const userId = (session.user as { id?: string })?.id ?? "";
  const userName = (session.user as { name?: string })?.name ?? userId;

  // Optional free-form period label. Client-supplied socSnapshot is NOT read.
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // Empty/plain body is fine — an attestation can be signed with no period.
  }
  const periodRaw = typeof body.period === "string" ? body.period.trim() : "";
  const period = periodRaw.length <= PERIOD_MAX ? periodRaw : null;

  const pa = await prisma.processArea.findUnique({
    where: { id },
    select: { id: true, name: true, companyId: true },
  });
  if (!pa) return NextResponse.json({ error: "Process area not found" }, { status: 404 });
  if (!pa.companyId) {
    return NextResponse.json({ error: "Process area has no owning company" }, { status: 404 });
  }

  const ok = await hasMicCompanyAccess(userId, pa.companyId);
  if (!ok) {
    return NextResponse.json({ error: "Access denied for company" }, { status: 403 });
  }

  try {
    // Server-computed snapshot — NEVER trusts the client.
    const snapshot = await computePaSocSnapshot(pa.id, pa.companyId);
    const attestedAt = new Date();

    const attestation = await prisma.micAttestation.create({
      data: {
        companyId: pa.companyId,
        processAreaId: pa.id,
        period: period || null,
        attestedByUserId: userId || null,
        attestedAt,
        socSnapshot: snapshot,
      },
    });

    // Audit row per attestation.
    await logActivity({
      activityType: "MIC_ATTEST",
      description: `${userName} signed a SOC attestation for process area “${pa.name}” (${pa.id})`,
      username: userName,
      refTable: "MicAttestation",
      refRecord: attestation.id,
      afterData: {
        companyId: pa.companyId,
        processAreaId: pa.id,
        period: period || null,
        attestedAt: attestedAt.toISOString(),
        snapshot,
      },
    });

    return NextResponse.json({
      attestation: {
        id: attestation.id,
        companyId: attestation.companyId,
        processAreaId: attestation.processAreaId,
        period: attestation.period,
        attestedByUserId: attestation.attestedByUserId,
        attestedAt: attestation.attestedAt.toISOString(),
        socSnapshot: attestation.socSnapshot,
      },
      snapshot,
      // Audit-friendly echo (no secrets; the snapshot is the client's own posture).
      _audit: { action: "MIC_ATTEST", processAreaId: pa.id, companyId: pa.companyId, byUserId: userId, at: attestedAt.toISOString() },
    });
  } catch (error) {
    console.error("Error signing MIC attestation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
