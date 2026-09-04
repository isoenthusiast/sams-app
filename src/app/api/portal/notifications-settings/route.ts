import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalAdminCompanyGate } from "@/lib/portal-admin-gate";

export const dynamic = "force-dynamic";

/**
 * Portal-admin Outbound Notifications settings (SAMS-009, Phase 3a Feature B).
 *
 * The company webhook URL is a WRITE-ONLY secret: settable via POST
 * (`{ webhookUrl }`), clearable via POST (`{ clear: true }`), but NEVER returned —
 * GET and POST both respond with `{ configured: boolean }` only (masked). The URL
 * never appears in any response, ActivityLog, or export.
 *
 * Gate: client-Admin role (role=Admin) who is a member of the resolved company.
 * The company resolves exactly like a portal page (param > cookie > home > first).
 * A non-Admin client, a cross-company user, or an unauthenticated caller gets 403.
 */
export async function GET(request: Request) {
  const gate = await portalAdminCompanyGate(request);
  if (gate.response) return gate.response;
  const companyId = gate.companyId as string;

  const configured = await isConfigured(companyId);
  return NextResponse.json({ configured });
}

export async function POST(request: Request) {
  const gate = await portalAdminCompanyGate(request);
  if (gate.response) return gate.response;
  const companyId = gate.companyId as string;

  let body: { webhookUrl?: unknown; clear?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.clear === true) {
    await prisma.company.update({ where: { id: companyId }, data: { notificationWebhookUrl: null } });
    return NextResponse.json({ configured: false, cleared: true });
  }

  const url = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "webhookUrl is required (or send {clear: true})" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "webhookUrl must be an http(s) URL" }, { status: 400 });
  }
  if (url.length > 1000) {
    return NextResponse.json({ error: "webhookUrl must be ≤ 1000 characters" }, { status: 400 });
  }

  await prisma.company.update({ where: { id: companyId }, data: { notificationWebhookUrl: url } });
  // Masked response only — the URL is never returned.
  return NextResponse.json({ configured: true });
}

async function isConfigured(companyId: string): Promise<boolean> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { notificationWebhookUrl: true },
  });
  return !!c?.notificationWebhookUrl;
}
