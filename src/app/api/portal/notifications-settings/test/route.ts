import { NextResponse } from "next/server";
import { portalAdminCompanyGate } from "@/lib/portal-admin-gate";
import { sendTestCard } from "@/lib/notifications-outbound";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/notifications-settings/test   (SAMS-009, Phase 3a Feature B)
 *
 * Client-Admin only (role=Admin + company membership). Posts a test card to the
 * company's webhook and reports the delivery result — `{ ok, status?, message }`.
 * The webhook URL is write-only and never returned.
 */
export async function POST(request: Request) {
  const gate = await portalAdminCompanyGate(request);
  if (gate.response) return gate.response;
  const companyId = gate.companyId as string;

  const result = await sendTestCard(companyId);
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
