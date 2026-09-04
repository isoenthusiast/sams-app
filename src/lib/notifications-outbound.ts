import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { emitNotification, postCompanyWebhook, NOTIFICATION_TYPE, NOTIFICATION_ENTITY_PROCESS_AREA, TITLE_MAX, BODY_MAX } from "@/lib/notifications";
import { resolveCadenceDays, deriveAttestationState, companySPOUserIds, countOverdueAttestations } from "@/lib/mic-attestations";

/**
 * Outbound Notifications (SAMS-009, Phase 3a Feature B) — sweep, weekly digest,
 * test card, and the CRON_SECRET gate. All outbound posting flows through
 * `postCompanyWebhook` (which NEVER throws, so a delivery failure can never fail
 * an upstream write). Cross-tenant is safe by construction: every post targets
 * the EVENT's OWN company URL (never another company's endpoint).
 */

/** CRON_SECRET bearer gate. Returns a 401 response, or null to continue. */
export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Misconfiguration — fail closed (never run unauthenticated).
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** The company's client Admin user ids (role=Admin, active, member of company). */
export async function companyClientAdminUserIds(companyId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      role: "Admin",
      active: true,
      OR: [{ companyId }, { userCompanies: { some: { companyId } } }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * In-app ActionOverdue notification to each of the company's client Admins.
 * Fire-and-forget (never throws). Entity = the Action (entityId = action id).
 */
async function notifyAdminsActionOverdue(opts: {
  actionId: string;
  actionDescription: string;
  companyId: string;
  adminUserIds: string[];
}): Promise<void> {
  const title = "Action overdue";
  const body = `An action is now overdue: “${opts.actionDescription.slice(0, 120)}”. Review it in the portal.`;
  for (const adminId of opts.adminUserIds) {
    await emitNotification({
      recipientUserId: adminId,
      type: NOTIFICATION_TYPE.ACTION_OVERDUE,
      entityType: "Action",
      entityId: opts.actionId,
      title: title.slice(0, TITLE_MAX),
      body: body.slice(0, BODY_MAX),
      companyId: opts.companyId,
    });
  }
}

export type SweepResult = { companies: number; actions: number; inApp: number };

/**
 * Sweep: actions that crossed their targetDate in the last 24h (and are still
 * open — closureDate null). For each affected company: one summarized webhook
 * card (if a webhook is configured) + an in-app ActionOverdue notification to the
 * company's client Admins. NEVER throws.
 */
export async function runNotifySweep(): Promise<SweepResult> {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const actions = await prisma.action.findMany({
    where: { closureDate: null, targetDate: { gte: from, lt: now } },
    include: {
      finding: {
        select: {
          id: true,
          description: true,
          severity: true,
          assessment: { select: { companyId: true } },
        },
      },
    },
  });

  const byCompany = new Map<string, typeof actions>();
  for (const a of actions) {
    const companyId = a.finding?.assessment?.companyId;
    if (!companyId) continue;
    const list = byCompany.get(companyId) ?? [];
    list.push(a);
    byCompany.set(companyId, list);
  }

  let inApp = 0;
  for (const [companyId, companyActions] of byCompany) {
    const adminIds = await companyClientAdminUserIds(companyId);
    const lines = companyActions.map((a) => {
      const actionText = a.actionDescription || "an action";
      const findingText = a.finding?.description ? ` (${a.finding.description.slice(0, 60)})` : "";
      return `• ${actionText.slice(0, 120)}${findingText} — due ${a.targetDate?.toISOString().slice(0, 10) ?? "unknown"}`;
    });
    const text = [
      `⏰ SAMS action overdue sweep — ${companyActions.length} action(s) newly overdue in the last 24h`,
      "",
      ...lines,
    ].join("\n");

    // Outbound webhook (no-op if the company has no endpoint configured).
    await postCompanyWebhook({ companyId, text });
    // In-app to client Admins (independent of webhook config).
    for (const a of companyActions) {
      await notifyAdminsActionOverdue({
        actionId: a.id,
        actionDescription: a.actionDescription,
        companyId,
        adminUserIds: adminIds,
      });
      inApp++;
    }
  }

  return { companies: byCompany.size, actions: actions.length, inApp };
}

export type DigestResult = { companies: number; posted: number };

/**
 * Weekly digest: for every company with a webhook configured, build one digest
 * card and post it. A company with no webhook is skipped (nothing to subscribe).
 * NEVER throws. Returns how many companies were posted to.
 */
export async function runWeeklyDigest(): Promise<DigestResult> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const companies = await prisma.company.findMany({
    where: { notificationWebhookUrl: { not: null, notIn: [""] } },
    select: { id: true, companyName: true },
  });

  let posted = 0;
  for (const company of companies) {
    const [total, fully, partially, notComply, newFindings, overdue, openRequests] = await Promise.all([
      prisma.requirement.count({ where: { companyId: company.id } }),
      prisma.requirement.count({ where: { companyId: company.id, socStatus: "FullyComply" } }),
      prisma.requirement.count({ where: { companyId: company.id, socStatus: "PartiallyComply" } }),
      prisma.requirement.count({ where: { companyId: company.id, socStatus: "NotComply" } }),
      prisma.finding.count({ where: { assessment: { companyId: company.id }, createdAt: { gte: weekAgo } } }),
      prisma.action.count({ where: { finding: { assessment: { companyId: company.id } }, closureDate: null, targetDate: { lt: now } } }),
      prisma.evidenceRequest.count({ where: { companyId: company.id, status: { in: ["Requested", "Submitted", "Rejected"] } } }),
    ]);

    const assessed = fully + partially + notComply;
    const coveragePct = assessed === 0 ? "—" : `${Math.round((fully / assessed) * 100)}%`;

    const text = [
      `📊 Weekly assurance digest — ${company.companyName}`,
      "",
      `• SOC coverage: ${coveragePct} of ${total} requirements assessed`,
      `• New findings this week: ${newFindings}`,
      `• Open findings: ${await prisma.finding.count({ where: { assessment: { companyId: company.id } } })}`,
      `• Overdue actions: ${overdue}`,
      `• Open evidence requests: ${openRequests}`,
      `• Overdue SOC attestations: ${await countOverdueAttestations(company.id)}`,
    ].join("\n");

    await postCompanyWebhook({ companyId: company.id, text });
    posted++;
  }

  return { companies: companies.length, posted };
}

export type AttestationDueResult = { companies: number; processAreas: number; notifications: number };

/**
 * SAMS-014 MIC Ritual — SPO in-app "attestation due" sweep (deterministic, no
 * scheduler). Called from the `/api/cron/weekly-digest` route (the ONLY recurring
 * sweep) AFTER the webhook digest loop.
 *
 * Deterministic trigger (derived state, no stored flag):
 *   - Sweeps **ALL companies with ≥1 PA whose derived state == overdue** — NOT
 *     gated by webhook config (a no-webhook company still gets its in-app bell;
 *     only the *digest line* is webhook-gated).
 *   - Recipients: active SPOs (client Admin/Assessor/Superuser with MIC company
 *     access) — the same gate set as the attest route, so the notified party can
 *     act.
 * Dedup (exactly-once per cadence window — no re-spam while a PA stays overdue):
 *   - Before emitting for a PA+recipient, skip if a `MicAttestationDue`
 *     notification for that PA+recipient exists with `createdAt > now - cadenceDays`.
 *   - A PA that stays overdue across weekly runs gets exactly one notification per
 *     recipient per window; once attested, next-due recomputes from the attestation
 *     date, the PA leaves *overdue*, and the window naturally re-arms ~cadence later.
 *
 * NEVER throws (emission is fire-and-forget); returns a count for the route's JSON.
 */
export async function runAttestationDueNotifications(): Promise<AttestationDueResult> {
  const now = new Date();
  const companies = await prisma.company.findMany({
    where: { archivedAt: null },
    select: { id: true, createdAt: true, attestationCadenceDays: true },
  });

  let processedCompanies = 0;
  let processedPas = 0;
  let notifications = 0;

  for (const company of companies) {
    const cadenceDays = resolveCadenceDays(company.attestationCadenceDays);
    const windowStart = new Date(now.getTime() - cadenceDays * 24 * 60 * 60 * 1000);
    const pas = await prisma.processArea.findMany({
      where: { companyId: company.id },
      select: {
        id: true,
        name: true,
        micAttestations: { orderBy: { attestedAt: "desc" }, take: 1, select: { attestedAt: true } },
      },
    });

    const overduePas = pas.filter((pa) => {
      const { state } = deriveAttestationState({
        lastAttestedAt: pa.micAttestations[0]?.attestedAt ?? null,
        goLiveAt: company.createdAt,
        cadenceDays,
        now,
      });
      return state === "overdue";
    });
    if (overduePas.length === 0) continue;

    processedCompanies++;
    const spoIds = await companySPOUserIds(company.id);

    for (const pa of overduePas) {
      processedPas++;
      for (const spoId of spoIds) {
        // Dedup: exactly-once per cadence window.
        const existing = await prisma.notification.findFirst({
          where: {
            recipientUserId: spoId,
            type: "MicAttestationDue",
            entityType: NOTIFICATION_ENTITY_PROCESS_AREA,
            entityId: pa.id,
            createdAt: { gt: windowStart },
          },
          select: { id: true },
        });
        if (existing) continue;

        const emitted = await emitNotification({
          recipientUserId: spoId,
          type: NOTIFICATION_TYPE.MIC_ATTEST_DUE,
          entityType: NOTIFICATION_ENTITY_PROCESS_AREA,
          entityId: pa.id,
          title: "SOC attestation due",
          body: `Process area “${pa.name}” is due for a SOC attestation. Review the snapshot and sign it in the process area page.`,
          companyId: company.id,
        });
        if (emitted) notifications++;
      }
    }
  }

  return { companies: processedCompanies, processAreas: processedPas, notifications };
}

/**
 * Portal "Send test" card — posts a test card to the company's webhook and
 * reports the delivery result. Returns a plain, safe object (never the URL).
 */
export async function sendTestCard(companyId: string): Promise<{ ok: boolean; status?: string; message: string }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { notificationWebhookUrl: true },
  });
  if (!company?.notificationWebhookUrl) {
    return { ok: false, message: "No webhook is configured for this company" };
  }
  await postCompanyWebhook({
    companyId,
    text: "✅ SAMS outbound notification test — if you can read this card, the webhook is configured correctly.",
  });
  const latest = await prisma.notificationDelivery.findFirst({
    where: { companyId },
    orderBy: { attemptedAt: "desc" },
    select: { status: true, responseCode: true },
  });
  if (!latest) return { ok: false, message: "Test card could not be recorded" };
  if (latest.status === "sent") return { ok: true, status: "sent", message: `Test card delivered (${latest.responseCode ?? "2xx"})` };
  return { ok: false, status: "failed", message: `Test card failed (${latest.responseCode ?? "error"})` };
}
