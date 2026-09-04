import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { portalHasCompanyAccess } from "@/lib/portal";
import { logActivity } from "@/lib/activity-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CADENCE_MIN = 1;
const CADENCE_MAX = 3650;

/**
 * PATCH /api/admin/companies/[id]/attestation-cadence   (SAMS-014, Phase 4 Feature B)
 *
 * Set (or clear) a company's per-company MIC attestation cadence. Due/soon/
 * overdue states are DERIVED, so changing the cadence recomputes next-due
 * IMMEDIATELY (no scheduler ticket) — this route is the only knob.
 *
 * GATE: client Admin/Superuser of that company (via `portalHasCompanyAccess` —
 * the same membership rule as the portal's only write) OR the provider plane.
 *
 * Body: `{ attestationCadenceDays: <int 1..3650> }` to set, or `null` to clear
 * (back to the quarterly default of 90).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as
    | { id?: string; role?: string; providerRole?: string | null; name?: string | null }
    | undefined;
  if (!user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const role = user.role ?? "";
  const providerRole = user.providerRole ?? null;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate cadence: a positive int to set, explicit null to clear.
  const raw = body.attestationCadenceDays;
  let cadence: number | null;
  if (raw === null || raw === undefined || raw === "") {
    cadence = null;
  } else if (typeof raw === "number" && Number.isInteger(raw) && raw >= CADENCE_MIN && raw <= CADENCE_MAX) {
    cadence = raw;
  } else {
    return NextResponse.json(
      { error: `attestationCadenceDays must be an integer between ${CADENCE_MIN} and ${CADENCE_MAX} (or null to reset)` },
      { status: 422 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, companyID: true, companyName: true },
  });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Gate: provider plane, OR client Admin/Superuser who is a member of that company.
  if (!providerRole) {
    if (role !== "Admin" && role !== "Superuser") {
      return NextResponse.json({ error: "Client Admin access required to change cadence" }, { status: 403 });
    }
    const member = await portalHasCompanyAccess(user.id, company.id);
    if (!member) {
      return NextResponse.json({ error: "Access denied for company" }, { status: 403 });
    }
  }

  try {
    const updated = await prisma.company.update({
      where: { id },
      data: { attestationCadenceDays: cadence },
      select: { id: true, companyID: true, companyName: true, attestationCadenceDays: true },
    });

    await logActivity({
      activityType: "MIC_CADENCE_CHANGE",
      description: `${user.name ?? user.id} set the attestation cadence for ${updated.companyName} (${updated.companyID}) to ${cadence ?? 90} days`,
      username: user.name ?? user.id,
      refTable: "Company",
      refRecord: updated.id,
      afterData: { companyId: updated.id, attestationCadenceDays: updated.attestationCadenceDays ?? null },
    });

    return NextResponse.json({
      company: {
        id: updated.id,
        companyID: updated.companyID,
        companyName: updated.companyName,
        attestationCadenceDays: updated.attestationCadenceDays,
        effectiveCadenceDays: updated.attestationCadenceDays ?? 90,
      },
      _audit: { action: "MIC_CADENCE_CHANGE", companyId: updated.id, byUserId: user.id },
    });
  } catch (error) {
    console.error("Error updating attestation cadence:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
