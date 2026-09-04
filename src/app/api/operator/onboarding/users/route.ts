import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  validateUserRows,
  provisionUsers,
  isProvisionBlocked,
  ProvisionValidationError,
  type OnboardingUserRow,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * User provisioning step (SAMS-008, step 3) — provider-gated.
 *
 * POST /api/operator/onboarding/users  body { companyId, rows, dryRun }
 *   - dryRun=true  → validateUserRows: per-row valid/duplicates/invalid-role/
 *     unresolved-manager report + manager-resolution rate. NEVER writes.
 *   - dryRun=false → provisionUsers: TRANSACTIONAL per company (a failure
 *     rolls back to ZERO partial users). Returns { created, wizardId, users,
 *     managerResolution } — temp passwords are NOT in this response (they are
 *     revealed exactly once via /finalize).
 *
 * A validation report with any duplicate, invalid role, or unresolved manager
 * (per settled decision #4, and DoD (b)) MUST block the commit — the client
 * calls the dry-run first, and only commits when `report.blocked` is false.
 */
export async function POST(request: NextRequest) {
  const { response } = await requireProvider();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const companyId = body.companyId as string | undefined;
  const rows = (body.rows ?? []) as OnboardingUserRow[];
  const dryRun = body.dryRun !== false;

  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  if (dryRun) {
    const report = await validateUserRows(rows);
    const blocked = isProvisionBlocked(report);
    return NextResponse.json({ ok: !blocked, blocked, report });
  }

  try {
    const result = await provisionUsers({ companyId, rows });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e: any) {
    // Write-boundary re-validation refusal → 4xx (409 duplicates / 422 bad rows).
    // The report is carried so the caller can render the same preview the
    // dry-run would. ZERO users were written (refusal happens before the txn).
    if (e instanceof ProvisionValidationError) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code, report: e.report }, { status: e.status });
    }
    const msg = e?.message || "Failed to provision users";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
