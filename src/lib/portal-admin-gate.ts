import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import { resolvePortalCompanyId, portalHasCompanyAccess } from "@/lib/portal";

/** Client-Admin portal gate for the current company. Returns { companyId } or a response. */
export async function portalAdminCompanyGate(request: Request): Promise<{ companyId?: string; response?: NextResponse }> {
  const session = await auth();
  if (!session?.user) {
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const user = session.user as { id?: string; role?: string; providerRole?: string | null };
  if (user.role !== "Admin") {
    return { response: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  const userId = user.id as string;

  // Resolve the portal's active company the same way a portal page does
  // (param > cookie > home > first-company-by-companyID). Never leaks a company
  // the caller isn't part of.
  const sp = new URL(request.url).searchParams.get("companyId");
  const cookieStore = await cookies();
  const cookieCompanyId = cookieStore.get("selectedCompanyId")?.value ?? null;
  const { companyId } = await resolvePortalCompanyId({
    userId,
    providerRole: user.providerRole ?? null,
    selectedCompanyId: sp,
    cookieCompanyId,
  });
  if (!companyId) {
    return { response: NextResponse.json({ error: "No company context" }, { status: 400 }) };
  }
  const ok = await portalHasCompanyAccess(userId, companyId);
  if (!ok) {
    return { response: NextResponse.json({ error: "Access denied for company" }, { status: 403 }) };
  }
  return { companyId };
}
