import { NextResponse } from "next/server";
import { authenticatePublicKey } from "@/lib/api-keys";
import { getPublicFindings } from "@/lib/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/public/v1/findings?status=open|closed
 *
 * Public read-only findings endpoint (SAMS-011, Phase 3b Feature B), scoped to
 * the bearer key's company. `status` is optional and maps to the DERIVED finding
 * lifecycle status (open = has ≥1 unresolved action; closed = otherwise) — there
 * is no `status` column on Finding, so this is computed from the action set (see
 * src/lib/public-api.ts). `?status=all` or absent ⇒ all findings. A status value
 * we don't define returns an empty list (documented; never a fallthrough).
 *
 * Auth: `Authorization: Bearer <sams_pub_…>`.
 * Errors (uniform `{ error }`): 401 missing/invalid key, 403 revoked key.
 */
export async function GET(request: Request) {
  const auth = await authenticatePublicKey(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  try {
    const data = await getPublicFindings(auth.companyId, auth.company, status);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in public /findings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
