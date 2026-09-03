import { requireProvider } from "@/lib/authz";
import { switchCompanyContext } from "@/lib/operator";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/operator/context-switch
 * Provider-gated. Writes a PROVIDER_CONTEXT_SWITCH ActivityLog row (before/after
 * = old/new selected company) when the selected company changes, sets the
 * `selectedCompanyId` cookie, and returns the target for the existing /admin or
 * /fla views.
 */
export async function POST(request: Request) {
  const { session, response } = await requireProvider();
  if (response) return response;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* body may be empty */
  }
  const companyId = (body as { companyId?: string })?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await switchCompanyContext({
    userId: (session.user as { id?: string }).id ?? "",
    username: (session.user as { name?: string }).name,
    role: (session.user as { role?: string }).role,
    targetCompanyId: companyId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Company not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set("selectedCompanyId", companyId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false, // kept readable by client JS (matches useSelectedCompanyId / CompanySelector)
    sameSite: "lax",
  });

  return NextResponse.json({
    ok: true,
    redirectTo: result.redirectTo,
    switched: result.switched,
  });
}
