import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { portalHasCompanyAccess } from "@/lib/portal";
import { acknowledgeContentBanner } from "@/lib/content-rollforward";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/content/acknowledge — client-facing. Persists the banner
 * dismissal (`acknowledgedContentVersion = currentVersion`) so it stays dismissed
 * across re-login. Membership-gated: the session user must be a client member of
 * the target company (no global Admin bypass here — same rule as the portal's
 * only write path).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const userId = (session.user as { id?: string }).id as string;
  const body = await request.json().catch(() => ({}));
  const companyId = body.companyId as string | undefined;
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const ok = await portalHasCompanyAccess(userId, companyId);
  if (!ok) return NextResponse.json({ error: "Access denied for company" }, { status: 403 });
  const result = await acknowledgeContentBanner(companyId);
  return NextResponse.json({ ok: true, ...result });
}
