import { prisma } from "@/lib/prisma";

// ── Core Drive Definitions ────────────────────────────────────────────

export interface CoreDriveScores {
  epicMeaning: number;
  development: number;
  empowerment: number;
  ownership: number;
  socialInfluence: number;
  scarcity: number;
  curiosity: number;
  lossAvoidance: number;
  overallEngagement: number;
  whiteHatBalance: number;   // CD1-5 average (intrinsic)
  blackHatBalance: number;   // CD6-8 average (extrinsic/urgency)
}

// ── Calculator ────────────────────────────────────────────────────────

/**
 * Calculate Octalysis 8 Core Drive scores for a user from behavioral data.
 * All scores normalized to 0-100 range.
 */
export async function calculateCoreDrives(userId: string): Promise<CoreDriveScores> {
  const scores: CoreDriveScores = {
    epicMeaning: 0,
    development: 0,
    empowerment: 0,
    ownership: 0,
    socialInfluence: 0,
    scarcity: 0,
    curiosity: 0,
    lossAvoidance: 50, // Base 50 for loss avoidance (neutral starting point)
    overallEngagement: 0,
    whiteHatBalance: 0,
    blackHatBalance: 0,
  };

  try {
    // ── CD1: Epic Meaning & Calling ──
    scores.epicMeaning = await calcEpicMeaning(userId);

    // ── CD2: Development & Accomplishment ──
    scores.development = await calcDevelopment(userId);

    // ── CD3: Empowerment of Creativity & Feedback ──
    scores.empowerment = await calcEmpowerment(userId);

    // ── CD4: Ownership & Possession ──
    scores.ownership = await calcOwnership(userId);

    // ── CD5: Social Influence & Relatedness ──
    scores.socialInfluence = await calcSocialInfluence(userId);

    // ── CD6: Scarcity & Impatience ──
    scores.scarcity = await calcScarcity(userId);

    // ── CD7: Unpredictability & Curiosity ──
    scores.curiosity = await calcCuriosity(userId);

    // ── CD8: Loss & Avoidance ──
    scores.lossAvoidance = await calcLossAvoidance(userId);

    // ── Overall Engagement (average of all 8) ──
    const allDrives = [
      scores.epicMeaning, scores.development, scores.empowerment,
      scores.ownership, scores.socialInfluence, scores.scarcity,
      scores.curiosity, scores.lossAvoidance,
    ];
    scores.overallEngagement = Math.round(allDrives.reduce((a, b) => a + b, 0) / allDrives.length);

    // ── White/Black Hat Balance ──
    const whiteDrives = [scores.epicMeaning, scores.development, scores.empowerment, scores.ownership, scores.socialInfluence];
    const blackDrives = [scores.scarcity, scores.curiosity, scores.lossAvoidance];
    scores.whiteHatBalance = Math.round(whiteDrives.reduce((a, b) => a + b, 0) / whiteDrives.length);
    scores.blackHatBalance = Math.round(blackDrives.reduce((a, b) => a + b, 0) / blackDrives.length);

    // ── Persist to EmotionalDriveMetric ──
    const period = new Date();
    period.setHours(0, 0, 0, 0);
    await prisma.emotionalDriveMetric.upsert({
      where: { userId_period: { userId, period } },
      create: {
        userId,
        period,
        epicMeaning: scores.epicMeaning,
        development: scores.development,
        empowerment: scores.empowerment,
        ownership: scores.ownership,
        socialInfluence: scores.socialInfluence,
        scarcity: scores.scarcity,
        curiosity: scores.curiosity,
        lossAvoidance: scores.lossAvoidance,
        overallEngagement: scores.overallEngagement,
      },
      update: {
        epicMeaning: scores.epicMeaning,
        development: scores.development,
        empowerment: scores.empowerment,
        ownership: scores.ownership,
        socialInfluence: scores.socialInfluence,
        scarcity: scores.scarcity,
        curiosity: scores.curiosity,
        lossAvoidance: scores.lossAvoidance,
        overallEngagement: scores.overallEngagement,
      },
    });
  } catch (err) {
    console.error("[driveCalculator] Error:", err);
  }

  return scores;
}

// ── Per-Drive Calculations ────────────────────────────────────────────

async function calcEpicMeaning(userId: string): Promise<number> {
  let score = 20; // Base: everyone starts with some meaning

  // +10 per completed assessment
  const assessmentCount = await prisma.pointTransaction.count({
    where: { userId, reason: { startsWith: "Conduct Assurance" } },
  });
  score += Math.min(assessmentCount * 10, 60);

  // +3 per interview participation
  const interviewCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "AActUsers" WHERE "userId" = $1`, userId
  );
  score += Math.min((interviewCount[0]?.count || 0) * 3, 20);

  return Math.min(score, 100);
}

async function calcDevelopment(userId: string): Promise<number> {
  let score = 0;

  // +1 per 10 XP (cap 50)
  const total = await prisma.pointTransaction.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  const xp = total._sum.points || 0;
  score += Math.min(Math.floor(xp / 10), 50);

  // +10 per badge (cap 30)
  const badgeCount = await prisma.userAchievement.count({ where: { userId } });
  score += Math.min(badgeCount * 10, 30);

  // +5 per PA track with XP (cap 20)
  const trackCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM (
       SELECT ga.id FROM "GameAttribute" ga
       INNER JOIN "PointTransaction" pt ON pt."gameAttributeId" = ga.id AND pt."userId" = $1
       GROUP BY ga.id HAVING SUM(pt.points) > 0
     ) t`, userId
  );
  score += Math.min((trackCount[0]?.count || 0) * 5, 20);

  return Math.min(score, 100);
}

async function calcEmpowerment(userId: string): Promise<number> {
  let score = 0;

  // +3 per detailed finding (raw SQL)
  const detailCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "Finding" WHERE "createdBy" = $1 AND LENGTH(COALESCE(details,'')) > 100`, userId
  );
  score += Math.min((detailCount[0]?.count || 0) * 3, 40);

  // +2 per attachment uploaded
  const attachCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "Attachment" WHERE "uploadedBy" = $1`, userId
  );
  score += Math.min((attachCount[0]?.count || 0) * 2, 30);

  // +1 per unique assessment type (cap 30)
  const typeCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(DISTINCT "activityTypeId")::int as count FROM "Assessment" WHERE "assessorId" = $1`, userId
  );
  score += Math.min((typeCount[0]?.count || 0) * 5, 30);

  return Math.min(score, 100);
}

async function calcOwnership(userId: string): Promise<number> {
  let score = 0;

  // +10 per PA track with XP (cap 50)
  const trackCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM (
       SELECT ga.id FROM "GameAttribute" ga
       INNER JOIN "PointTransaction" pt ON pt."gameAttributeId" = ga.id AND pt."userId" = $1
       GROUP BY ga.id HAVING SUM(pt.points) > 0
     ) t`, userId
  );
  score += Math.min((trackCount[0]?.count || 0) * 10, 50);

  // +5 per badge (cap 25)
  const badgeCount = await prisma.userAchievement.count({ where: { userId } });
  score += Math.min(badgeCount * 5, 25);

  // +3 per control assigned (raw SQL — ControlAssignment may not be in Prisma schema)
  const ctrlCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "ControlAssignment" WHERE "assessorId" = $1`, userId
  );
  score += Math.min((ctrlCount[0]?.count || 0) * 3, 25);

  return Math.min(score, 100);
}

async function calcSocialInfluence(userId: string): Promise<number> {
  let score = 0;

  // +5 per action assigned to others (raw SQL)
  const actionCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "Action" WHERE "actionParty" = $1`, userId
  );
  score += Math.min((actionCount[0]?.count || 0) * 5, 40);

  // +5 per collaborative assessment (raw SQL)
  const collabCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "AssessmentAssessor" WHERE "userId" = $1`, userId
  );
  score += Math.min((collabCount[0]?.count || 0) * 5, 30);

  // +3 per assessment as lead assessor
  const assessorCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "Assessment" WHERE "assessorId" = $1`, userId
  );
  score += Math.min((assessorCount[0]?.count || 0) * 3, 30);

  return Math.min(score, 100);
}

async function calcScarcity(userId: string): Promise<number> {
  let score = 0;

  // +15 per Epic/Legendary badge
  const epicBadges = await prisma.userAchievement.count({
    where: { userId, badge: { rarity: { in: ["Epic", "Legendary"] } } },
  });
  score += Math.min(epicBadges * 15, 45);

  // +10 per Rare badge
  const rareBadges = await prisma.userAchievement.count({
    where: { userId, badge: { rarity: "Rare" } },
  });
  score += Math.min(rareBadges * 10, 30);

  // +5 per Uncommon badge (cap 25)
  const uncommonBadges = await prisma.userAchievement.count({
    where: { userId, badge: { rarity: "Uncommon" } },
  });
  score += Math.min(uncommonBadges * 5, 25);

  return Math.min(score, 100);
}

async function calcCuriosity(userId: string): Promise<number> {
  let score = 0;

  // +10 per unique PA explored
  const paCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(DISTINCT ga.id)::int as count FROM "PointTransaction" pt
     JOIN "GameAttribute" ga ON pt."gameAttributeId" = ga.id
     WHERE pt."userId" = $1`, userId
  );
  score += Math.min((paCount[0]?.count || 0) * 10, 50);

  // +10 per assessment type variety
  const typeCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(DISTINCT "activityTypeId")::int as count FROM "Assessment" WHERE "assessorId" = $1`, userId
  );
  score += Math.min((typeCount[0]?.count || 0) * 10, 30);

  // +5 per finding category diversity
  const findingCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(DISTINCT "severity")::int as count FROM "Finding" WHERE "createdBy" = $1`, userId
  );
  score += Math.min((findingCount[0]?.count || 0) * 5, 20);

  return Math.min(score, 100);
}

async function calcLossAvoidance(userId: string): Promise<number> {
  let score = 50; // Neutral starting point

  // -5 per overdue assessment (if any)
  const overdueCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "Assessment"
     WHERE "assessorId" = $1 AND status = 'Planned' AND "createdAt" < NOW() - INTERVAL '30 days'`, userId
  );
  score -= Math.min((overdueCount[0]?.count || 0) * 5, 30);

  // +10 if all actions closed on time (recent window)
  const actionStats = await prisma.$queryRawUnsafe<Array<{ closed: number; total: number }>>(
    `SELECT
       COUNT(*) FILTER (WHERE "closureDate" IS NOT NULL)::int as closed,
       COUNT(*)::int as total
     FROM "Action" WHERE "actionParty" = $1`, userId
  );
  if (actionStats[0]?.total > 0) {
    const closeRate = (actionStats[0]?.closed || 0) / actionStats[0].total;
    score += Math.round(closeRate * 20);
  }

  return Math.max(0, Math.min(score, 100));
}
