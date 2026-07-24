import { prisma } from "@/lib/prisma";
import type { AchievementBadge } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────

export interface BadgeEvaluationResult {
  badgeId: string;
  badgeName: string;
  badgeType: string;
  level: string | null;
  earned: boolean;
  alreadyHad: boolean;
}

// ── Badge Evaluator ──────────────────────────────────────────────────

/**
 * Evaluate all active badges for a user after an event.
 * Awards any newly-met badges. Idempotent — won't re-award already-earned badges.
 */
export async function evaluateBadges(userId: string): Promise<BadgeEvaluationResult[]> {
  const results: BadgeEvaluationResult[] = [];
  const allBadges = await prisma.achievementBadge.findMany();

  for (const badge of allBadges) {
    const alreadyHas = await prisma.userAchievement.findFirst({
      where: { userId, badgeId: badge.id },
    });

    if (alreadyHas) {
      results.push({
        badgeId: badge.id,
        badgeName: badge.badgeName,
        badgeType: badge.badgeType,
        level: badge.level,
        earned: false,
        alreadyHad: true,
      });
      continue;
    }

    const earned = await checkBadgeCriteria(userId, badge);
    if (earned) {
      await prisma.userAchievement.create({
        data: { userId, badgeId: badge.id },
      });
    }

    results.push({
      badgeId: badge.id,
      badgeName: badge.badgeName,
      badgeType: badge.badgeType,
      level: badge.level,
      earned,
      alreadyHad: false,
    });
  }

  return results;
}

// ── Criteria Checks ──────────────────────────────────────────────────

async function checkBadgeCriteria(userId: string, badge: AchievementBadge): Promise<boolean> {
  switch (badge.badgeType) {
    case "track":
      return checkTrackBadge(userId, badge);
    case "role":
      return checkRoleBadge(userId, badge);
    case "special":
      return checkSpecialBadge(userId, badge);
    default:
      return false;
  }
}

/**
 * Track badges: earned by reaching XP thresholds in a Process Area.
 * Criteria: badge.processAreaId + badge.pointsRequired + badge.level
 */
async function checkTrackBadge(userId: string, badge: AchievementBadge): Promise<boolean> {
  if (!badge.processAreaId || !badge.pointsRequired) return false;

  const result = await prisma.$queryRawUnsafe<Array<{ xp: number }>>(
    `SELECT COALESCE(SUM(pt.points), 0) as xp
     FROM "PointTransaction" pt
     WHERE pt."userId" = $1 AND pt."gameAttributeId" IN (
       SELECT ga.id FROM "GameAttribute" ga WHERE ga."id" = $2
     )`,
    userId,
    badge.processAreaId
  );

  // gameAttributeId on badge may reference a GameAttribute directly
  const gaResult = await prisma.$queryRawUnsafe<Array<{ xp: number }>>(
    `SELECT COALESCE(SUM(pt.points), 0) as xp
     FROM "PointTransaction" pt
     JOIN "GameAttribute" ga ON pt."gameAttributeId" = ga.id
     JOIN "ProcessArea" pa ON ga."attributeName" = pa.name
     WHERE pt."userId" = $1 AND pa.id = $2`,
    userId,
    badge.processAreaId
  );

  const xp = (result[0]?.xp || 0) + (gaResult[0]?.xp || 0);
  return xp >= badge.pointsRequired;
}

/**
 * Role badges: earned by meeting role-specific thresholds.
 * Criteria: badge.pointsRequired (total XP) + badge.controlsChecked (assessments participated)
 */
async function checkRoleBadge(userId: string, badge: AchievementBadge): Promise<boolean> {
  let meetsThreshold = true;

  if (badge.pointsRequired) {
    const total = await prisma.pointTransaction.aggregate({
      where: { userId },
      _sum: { points: true },
    });
    if ((total._sum.points || 0) < badge.pointsRequired) meetsThreshold = false;
  }

  if (badge.controlsChecked) {
    const assessmentCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(DISTINCT pt."assessmentId") as count
       FROM "PointTransaction" pt
       WHERE pt."userId" = $1 AND pt."assessmentId" IS NOT NULL`,
      userId
    );
    if ((assessmentCount[0]?.count || 0) < badge.controlsChecked) meetsThreshold = false;
  }

  return meetsThreshold;
}

/**
 * Special badges: earned by unique achievements.
 * Criteria: badge.achievementType determines the check.
 */
async function checkSpecialBadge(userId: string, badge: AchievementBadge): Promise<boolean> {
  if (!badge.achievementType) return false;

  switch (badge.achievementType) {
    case "first_assessment": {
      const count = await prisma.pointTransaction.count({
        where: { userId, reason: { startsWith: "Conduct Assurance" } },
      });
      return count > 0;
    }
    case "first_badge": {
      const count = await prisma.userAchievement.count({ where: { userId } });
      return count > 0; // They already have at least one badge
    }
    default:
      return false;
  }
}

// ── Streak Badge Check (future — P2+ enhancement) ────────────────────

/**
 * Streak badges: earned by consecutive periods of activity.
 * (Placeholder — full implementation requires period tracking.)
 */
export async function checkStreakBadge(_userId: string, _badge: AchievementBadge): Promise<boolean> {
  // Future: check consecutive periods (quarters/weeks) with assessment activity
  return false;
}

// ── Mentor Badge Check (future — P2+ enhancement) ────────────────────

/**
 * Mentor badges: earned by growing others.
 * (Placeholder — full implementation requires mentorship tracking.)
 */
export async function checkMentorBadge(_userId: string, _badge: AchievementBadge): Promise<boolean> {
  // Future: check if user has mentored someone who reached a level
  return false;
}
