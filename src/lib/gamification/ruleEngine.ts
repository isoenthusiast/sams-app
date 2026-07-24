import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { GameAttributeRule } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────

export interface EventContext {
  assessmentId?: string;
  sampleId?: string;
  activityLogId?: string;
  metadata?: Record<string, any>;
}

export interface RuleMatch {
  rule: GameAttributeRule;
  basePoints: number;
  adjustedPoints: number;
  multiplier: number;
}

// ── Rule Lookup ──────────────────────────────────────────────────────

/**
 * Find all active rules matching a given (source, eventType, gameAttributeId, role).
 * Rules cascade: specific role match > null role (applies to all roles).
 * gameAttributeId=null rules are universal (e.g., Conduct Assurance).
 */
export async function findApplicableRules(
  source: string,
  eventType: string,
  gameAttributeId?: string | null,
  role?: string | null,
): Promise<GameAttributeRule[]> {
  const where: Prisma.GameAttributeRuleWhereInput = {
    source,
    eventType,
    isActive: true,
    role: { in: [role ?? "any", "any"] },
  };

  // gameAttributeId matching: if provided, match it; if null/undefined, match "any" concept
  // For track-specific rules, gameAttributeId is the Ga ID; for universal, it's null
  // We need both: exact match OR null (universal)
  if (gameAttributeId) {
    where.OR = [
      { gameAttributeId },
      { gameAttributeId: null },
    ];
  } else {
    where.gameAttributeId = null;
  }

  return prisma.gameAttributeRule.findMany({ where });
}

// ── Point Calculation ────────────────────────────────────────────────

/**
 * Calculate final points for a rule given optional context.
 * Applies conditions and dynamic modifiers from the rule definition.
 */
export function calculatePoints(
  rule: GameAttributeRule,
  unitCount: number = 1,
  playerLevel?: string,
): RuleMatch {
  let multiplier = rule.multiplier ?? 1.0;

  // Apply contextual conditions (Level 2)
  const conditions = (rule.conditions as any[]) || [];
  for (const cond of conditions) {
    // Future: evaluate conditions against context
    // For now, conditions are stored but evaluation is deferred to P1+
  }

  // Apply dynamic modifiers (Level 3) — e.g., catch-up bonuses
  const modifiers = (rule.dynamicModifiers as any[]) || [];
  for (const mod of modifiers) {
    if (mod.type === "catchUpBonus" && playerLevel) {
      // Future: compare playerLevel to maxLevel
    }
    if (mod.type === "streakBonus") {
      // Future: check streak data
    }
  }

  const basePoints = rule.basePoints;
  const perUnit = (rule.perUnitPoints ?? 0) * unitCount;
  const adjustedPoints = Math.round((basePoints + perUnit) * multiplier);

  return { rule, basePoints, adjustedPoints, multiplier };
}

// ── Point Awarding ───────────────────────────────────────────────────

export interface AwardResult {
  pointsAwarded: number;
  transactionId: string;
}

/**
 * Create a PointTransaction and update User.totalPoints.
 */
export async function awardPoints(
  userId: string,
  ruleMatch: RuleMatch,
  reason: string,
  context: EventContext = {},
): Promise<AwardResult> {
  const { rule, adjustedPoints } = ruleMatch;

  const tx = await prisma.pointTransaction.create({
    data: {
      userId,
      points: adjustedPoints,
      reason,
      assessmentId: context.assessmentId,
      sampleId: context.sampleId,
      gameAttributeId: rule.gameAttributeId,
      activityLogId: context.activityLogId,
      emotionalDrive: null, // Will be populated by Core Drive Calculator (P4)
      multiplier: ruleMatch.multiplier,
    },
  });

  // Update User.totalPoints
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "totalPoints" = "totalPoints" + $1 WHERE id = $2`,
    adjustedPoints,
    userId,
  );

  return { pointsAwarded: adjustedPoints, transactionId: tx.id };
}

// ── Seed Rules ───────────────────────────────────────────────────────

/**
 * Ensure the standard SAMS gamification rules exist.
 * Idempotent — uses upsert semantics via unique constraint.
 */
export async function seedStandardRules(): Promise<void> {
  const rules: Array<{
    source: string;
    eventType: string;
    gameAttributeId: string | null;
    role: string | null;
    basePoints: number;
    perUnitPoints: number;
    description: string;
  }> = [
    // ── Conduct Assurance (role-based, assessment_complete) ──
    { source: "SAMS", eventType: "assessment_complete", gameAttributeId: null, role: "leadAssessor", basePoints: 10, perUnitPoints: 0, description: "Lead Assessor conducts an assessment" },
    { source: "SAMS", eventType: "assessment_complete", gameAttributeId: null, role: "assessor", basePoints: 5, perUnitPoints: 0, description: "Assessor participates in an assessment" },
    { source: "SAMS", eventType: "assessment_complete", gameAttributeId: null, role: "interviewee", basePoints: 1, perUnitPoints: 0, description: "Interviewee participates in an interview" },
    { source: "SAMS", eventType: "assessment_complete", gameAttributeId: null, role: "auditee", basePoints: 10, perUnitPoints: 0, description: "Auditee leads an assessment" },
    { source: "SAMS", eventType: "assessment_complete", gameAttributeId: null, role: "actionParty", basePoints: 5, perUnitPoints: 0, description: "Action party closes a finding" },

    // ── Domain XP (per-PA, assessment_complete) — role="any" catches all roles ──
    // These are created dynamically per GameAttribute.

    // ── Interview participation ──
    { source: "SAMS", eventType: "interview_complete", gameAttributeId: null, role: "interviewee", basePoints: 1, perUnitPoints: 0, description: "Interview participation" },
  ];

  for (const r of rules) {
    const existing = await prisma.gameAttributeRule.findFirst({
      where: {
        source: r.source,
        eventType: r.eventType,
        gameAttributeId: r.gameAttributeId,
        role: r.role,
      },
    });
    if (!existing) {
      await prisma.gameAttributeRule.create({ data: r });
    }
  }

  console.log(`[ruleEngine] Seeded ${rules.length} standard rules`);
}
