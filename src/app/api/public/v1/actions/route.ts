import { NextResponse } from "next/server";
import { authenticatePublicKey } from "@/lib/api-keys";
import { getPublicActions } from "@/lib/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/public/v1/actions?overdue=true
 *
 * Public read-only actions endpoint (SAMS-011, Phase 3b Feature B), scoped to the
 * bearer key's company. `overdue` is optional (`true` ⇒ only actions that are
 * open AND past their targetDate; absent/false ⇒ all actions).
 *
 * Auth: `Authorization: Bearer <sams_pub_…>`.
 * Errors (uniform `{ error }`): 401 missing/invalid key, 403 revoked key.
 */
export async function GET(request: Request) {
  const auth = await authenticatePublicKey(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const overdueParam = url.searchParams.get("overdue")?.toLowerCase() ?? "";
  const overdue = overdueParam === "true" || overdueParam === "1";

  try {
    const data = await getPublicActions(auth.companyId, auth.company, overdue);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in public /actions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
