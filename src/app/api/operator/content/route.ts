import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/authz";
import { getOperatorContentStatus } from "@/lib/content-rollforward";

export const dynamic = "force-dynamic";

/**
 * GET /api/operator/content — provider-gated per-client content status:
 * current content version + available version + update-available + the diff
 * (added / changed / conflicts / removed) the operator previews before adopting.
 */
export async function GET() {
  const { response } = await requireProvider();
  if (response) return response;
  const rows = await getOperatorContentStatus();
  return NextResponse.json({ companies: rows });
}
