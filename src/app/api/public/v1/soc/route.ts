import { NextResponse } from "next/server";
import { authenticatePublicKey } from "@/lib/api-keys";
import { getPublicSoc } from "@/lib/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/public/v1/soc
 *
 * Public read-only SOC endpoint (SAMS-011, Phase 3b Feature B) — the #51
 * coverage ratio per process-area and overall, scoped to the bearer key's
 * company. SCOPE-BY-CONSTRUCTION: the company comes from the key, never a param.
 *
 * Auth: `Authorization: Bearer <sams_pub_…>`.
 * Errors (uniform `{ error }`): 401 missing/invalid key, 403 revoked key.
 */
export async function GET(request: Request) {
  const auth = await authenticatePublicKey(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await getPublicSoc(auth.companyId, auth.company);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in public /soc:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
