import { requireProvider } from "@/lib/authz";
import { getPortfolio } from "@/lib/operator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/operator/portfolio — provider-gated JSON backing the /operator page. */
export async function GET() {
  const { response } = await requireProvider();
  if (response) return response;

  try {
    const companies = await getPortfolio();
    return NextResponse.json({ companies });
  } catch (error) {
    console.error("[operator/portfolio] error:", error);
    return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 });
  }
}
