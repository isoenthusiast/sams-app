import { NextResponse } from "next/server";
import { findApplicableRules, calculatePoints, awardPoints, seedStandardRules, type EventContext } from "@/lib/gamification/ruleEngine";
import { evaluateBadges } from "@/lib/gamification/badgeEngine";

/**
 * POST /api/gamification/events
 *
 * The single entry point for ALL gamification events — internal (SAMS) and
 * external (CMMS, LMS, Permit systems, CSV imports).
 *
 * Body: {
 *   userId: string,
 *   source: string,       // "SAMS", "CMMS", "LMS", "PERMIT", "CSV_IMPORT", etc.
 *   eventType: string,     // "assessment_complete", "work_order_complete", "training_passed", etc.
 *   context?: {
 *     assessmentId?: string,
 *     sampleId?: string,
 *     activityLogId?: string,
 *     metadata?: Record<string, any>
 *   }
 * }
 *
 * The external system does NOT need to know anything about gamification.
 * It just says "this user did this thing." SAMS decides what it's worth.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, source, eventType, context } = body;

    if (!userId || !source || !eventType) {
      return NextResponse.json(
        { error: "userId, source, and eventType are required" },
        { status: 400 }
      );
    }

    // Ensure standard rules exist (idempotent)
    await seedStandardRules();

    const ctx: EventContext = {
      assessmentId: context?.assessmentId,
      sampleId: context?.sampleId,
      activityLogId: context?.activityLogId,
      metadata: context?.metadata,
    };

    const results: Array<{
      ruleId: string;
      gameAttributeId: string | null;
      pointsAwarded: number;
      reason: string;
    }> = [];
    let totalPoints = 0;

    // Find rules matching this event (without a specific gameAttributeId — universal rules)
    const universalRules = await findApplicableRules(source, eventType, null, null);
    for (const rule of universalRules) {
      const match = calculatePoints(rule, 1);
      if (match.adjustedPoints > 0) {
        const awarded = await awardPoints(
          userId,
          match,
          `${source}.${eventType}`,
          ctx
        );
        totalPoints += awarded.pointsAwarded;
        results.push({
          ruleId: rule.id,
          gameAttributeId: rule.gameAttributeId,
          pointsAwarded: awarded.pointsAwarded,
          reason: rule.description || `${source}.${eventType}`,
        });
      }
    }

    // If context includes a specific gameAttributeId, also check track-specific rules
    if (context?.gameAttributeId) {
      const trackRules = await findApplicableRules(source, eventType, context.gameAttributeId, null);
      for (const rule of trackRules) {
        const match = calculatePoints(rule, 1);
        if (match.adjustedPoints > 0) {
          const awarded = await awardPoints(
            userId,
            match,
            `${source}.${eventType} — ${rule.description || "Track XP"}`,
            ctx
          );
          totalPoints += awarded.pointsAwarded;
          results.push({
            ruleId: rule.id,
            gameAttributeId: rule.gameAttributeId,
            pointsAwarded: awarded.pointsAwarded,
            reason: rule.description || "Track XP",
          });
        }
      }
    }

    // After awarding points, evaluate badges
    const badgeResults = await evaluateBadges(userId);
    const newlyEarnedBadges = badgeResults.filter(b => b.earned).map(b => ({
      badgeId: b.badgeId,
      badgeName: b.badgeName,
      badgeType: b.badgeType,
      level: b.level,
    }));

    return NextResponse.json({
      success: true,
      totalPointsAwarded: totalPoints,
      rulesMatched: results.length,
      details: results,
      badgesAwarded: newlyEarnedBadges,
    });
  } catch (err: any) {
    console.error("[gamification/events] Error:", err);
    return NextResponse.json(
      { error: "Internal error processing event" },
      { status: 500 }
    );
  }
}
