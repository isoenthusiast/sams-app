import { NextResponse } from "next/server";
import { requireCronSecret, runWeeklyDigest, runAttestationDueNotifications } from "@/lib/notifications-outbound";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/weekly-digest   (SAMS-009, Phase 3a Feature B; + SAMS-014)
 *
 * CRON_SECRET bearer-gated (401 without it). For every company with a webhook
 * configured, posts ONE weekly digest card: SOC coverage %, new findings this
 * week, overdue actions, open evidence requests, + the overdue-SOC-attestations
 * line (SAMS-014 B4). Fire-and-record — a delivery failure never fails the digest.
 *
 * Then runs the MIC attestation-due sweep (SAMS-014 B2): emits an in-app
 * `MicAttestationDue` notification to each company's SPOs for every PA whose
 * derived state == overdue — deduped per cadence window (exactly-once). Not
 * webhook-gated (a no-webhook company still gets its bells). Reported in the
 * response JSON so it is externally assertable.
 *
 * Trigger is external (Hermes box cron pilot in v1; Railway cron is documented
 * as the production alternative).
 */
export async function POST(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runWeeklyDigest();
  const attestationDue = await runAttestationDueNotifications();
  return NextResponse.json({ ok: true, ...result, attestationDue });
}
