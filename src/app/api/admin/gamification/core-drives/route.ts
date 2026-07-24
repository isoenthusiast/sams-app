import { NextResponse } from "next/server";
import { calculateCoreDrives } from "@/lib/gamification/driveCalculator";

/**
 * GET /api/admin/gamification/core-drives?userId=X
 *
 * Returns Octalysis 8 Core Drive scores for a user.
 * Calculated from behavioral data, cached in EmotionalDriveMetric.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const scores = await calculateCoreDrives(userId);
    return NextResponse.json(scores);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
