import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findApplicableRules, calculatePoints, awardPoints, seedStandardRules } from "@/lib/gamification/ruleEngine";
import { evaluateBadges } from "@/lib/gamification/badgeEngine";

/**
 * POST /api/webhooks/[source]
 *
 * Unified webhook receiver for external systems (CMMS, LMS, Permit, etc.).
 * Validates X-Webhook-Secret header against WEBHOOK_SECRET env var.
 * Delegates to the gamification rule engine for point awarding.
 *
 * Body: {
 *   userId: string,
 *   eventType: string,
 *   metadata?: Record<string, any>
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  const { source } = await params;

  // Validate webhook secret
  const secret = request.headers.get("x-webhook-secret");
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, eventType, metadata } = body;
  if (!userId || !eventType) {
    return NextResponse.json({ error: "userId and eventType are required" }, { status: 400 });
  }

  // Log the webhook call
  const logEntry = await prisma.webhookLog.create({
    data: {
      source,
      eventType,
      payload: body,
      status: "received",
    },
  });

  try {
    // Ensure rules exist
    await seedStandardRules();

    let totalPoints = 0;
    let totalBadges = 0;

    // Process via rule engine
    const rules = await findApplicableRules(source, eventType, null, null);
    for (const rule of rules) {
      const match = calculatePoints(rule, 1);
      if (match.adjustedPoints > 0) {
        const awarded = await awardPoints(userId, match, `${source}.${eventType}`, {
          metadata,
        });
        totalPoints += awarded.pointsAwarded;
      }
    }

    // Evaluate badges
    const badgeResults = await evaluateBadges(userId);
    totalBadges = badgeResults.filter(b => b.earned).length;

    // Update log entry
    await prisma.webhookLog.update({
      where: { id: logEntry.id },
      data: {
        status: "processed",
        response: JSON.stringify({ pointsAwarded: totalPoints, badgesAwarded: totalBadges }),
      },
    });

    return NextResponse.json({
      success: true,
      source,
      eventType,
      pointsAwarded: totalPoints,
      badgesAwarded: totalBadges,
    });
  } catch (err: any) {
    // Log error
    await prisma.webhookLog.update({
      where: { id: logEntry.id },
      data: {
        status: "error",
        response: err.message,
      },
    });

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
