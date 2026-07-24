import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { advanceStage } from "@/lib/gamification/stageManager";
import { getSelectedCompanyId } from "@/lib/authz";

/**
 * POST /api/admin/gamification/advance
 *
 * Advance the company to the next gamification stage.
 * Only works if readiness signals are met.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const companyId = await getSelectedCompanyId() || "comp_1783989395315";
    const userId = (session.user as any).id;
    const result = await advanceStage(companyId, userId);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
