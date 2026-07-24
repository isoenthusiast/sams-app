import { NextResponse } from "next/server";
import { getStage, checkReadiness, getStageInfo } from "@/lib/gamification/stageManager";
import { getSelectedCompanyId } from "@/lib/authz";

/**
 * GET /api/admin/gamification/readiness
 *
 * Returns current stage + readiness signals for next stage advancement.
 */
export async function GET() {
  try {
    const companyId = await getSelectedCompanyId() || "comp_1783989395315";
    const { stage } = await getStage(companyId);
    const currentInfo = getStageInfo(stage);

    let nextStageReadiness = null;
    if (stage < 3) {
      nextStageReadiness = await checkReadiness(companyId, (stage + 1) as 1 | 2 | 3);
    }

    const nextInfo = stage < 3 ? getStageInfo(stage + 1) : null;

    return NextResponse.json({
      companyId,
      currentStage: stage,
      currentStageName: currentInfo.name,
      currentStageDescription: currentInfo.description,
      nextStage: stage < 3 ? stage + 1 : null,
      nextStageName: nextInfo?.name ?? null,
      readyForNext: nextStageReadiness?.ready ?? false,
      signals: nextStageReadiness?.signals ?? {},
      reason: nextStageReadiness?.reason ?? "At maximum stage.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
