import { NextResponse } from "next/server";
import { requireCronSecret, runNotifySweep } from "@/lib/notifications-outbound";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/notify-sweep   (SAMS-009, Phase 3a Feature B)
 *
 * CRON_SECRET bearer-gated (401 without it). Sweeps for actions that crossed
 * their targetDate in the last 24h and are still open (closureDate null); for
 * each affected company it posts ONE summarized company-channel webhook card (if
 * the company has a webhook configured) + an in-app ActionOverdue notification to
 * the company's client Admins. Fire-and-record — a delivery failure never fails
 * the sweep.
 *
 * Trigger is external (Hermes box cron pilot in v1; Railway cron is documented
 * as the production alternative). Never runs unauthenticated (fail-closed).
 */
export async function POST(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runNotifySweep();
  return NextResponse.json({ ok: true, ...result });
}
