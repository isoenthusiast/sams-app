import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolvePortalCompanyId } from "@/lib/portal";
import { getClientContentBanner } from "@/lib/content-rollforward";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/content/banner — client-facing content-baseline banner state.
 * Reads the session user's portal company (param > cookie > home > first; never
 * a cross-tenant leaked value) and returns whether the "baseline updated" banner
 * should show (current adopted version newer than the acknowledged one) plus the
 * what-changed diff for the banner link.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const userId = (session.user as { id?: string }).id as string;
  const providerRole = (session.user as { providerRole?: string | null }).providerRole ?? null;

  const sp = request.nextUrl.searchParams.get("companyId") ?? null;
  const resolved = await resolvePortalCompanyId({ userId, providerRole, selectedCompanyId: sp });
  if (!resolved.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 });
  const { show, currentVersion, acknowledgedVersion, diff, updateAvailable } = await getClientContentBanner(resolved.companyId);
  return NextResponse.json({ companyId: resolved.companyId, show, currentVersion, acknowledgedVersion, diff, updateAvailable });
}
