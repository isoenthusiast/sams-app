import { NextRequest, NextResponse } from "next/server";
import { requireProvider } from "@/lib/authz";
import { buildOnboardingReport, consumeTempPasswords } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * Review & go-live (SAMS-008, step 4) — provider-gated.
 *
 * POST /api/operator/onboarding/finalize  body { companyId, wizardId }
 *
 * Builds the consolidated validation report and returns the temp passwords for
 * the given wizardId EXACTLY ONCE (consumeTempPasswords deletes the entry, so a
 * second call returns []). This is the only place a temp password is ever
 * emitted to a response — never in ActivityLog, never in a user-list/API dump,
 * never on the server console.
 */
export async function POST(request: NextRequest) {
  const { response } = await requireProvider();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const companyId = body.companyId as string | undefined;
  const wizardId = body.wizardId as string | undefined;

  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const report = await buildOnboardingReport(companyId);
  const tempPasswords = wizardId ? consumeTempPasswords(wizardId) : [];

  return NextResponse.json({ ok: true, report, tempPasswords });
}
