import { NextRequest, NextResponse } from "next/server";
import { runBootstrap } from "@/lib/bootstrap";

// POST /api/admin/company/[id]/bootstrap
// Bootstraps a company with SAMS001 master data (Standards → PAs → Requirements → Controls → MapControl2Requirement)
// Only allowed when company has 0 assessments (destructive: deletes existing master data, re-inserts from SAMS001)
//
// Implementation lives in `@/lib/bootstrap` (single adoption path). The
// Onboarding Wizard (SAMS-008) reuses `runBootstrap` through its own
// provider-gated route rather than reimplementing this copy.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetCompanyId } = await params;
  try {
    const result = await runBootstrap(targetCompanyId);
    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.message || "Bootstrap failed";
    const status = /Company not found/i.test(msg) ? 404 : /Cannot bootstrap/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
