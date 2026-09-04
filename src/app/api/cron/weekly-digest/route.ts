import { NextResponse } from "next/server";
import { requireCronSecret, runWeeklyDigest } from "@/lib/notifications-outbound";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/weekly-digest   (SAMS-009, Phase 3a Feature B)
 *
 * CRON_SECRET bearer-gated (401 without it). For every company with a webhook
 * configured, posts ONE weekly digest card: SOC coverage %, new findings this
 * week, overdue actions, open evidence requests. Fire-and-record — a delivery
 * failure never fails the digest run.
 *
 * Trigger is external (Hermes box cron pilot in v1; Railway cron is documented
 * as the production alternative).
 */
export async function POST(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runWeeklyDigest();
  return NextResponse.json({ ok: true, ...result });
}
