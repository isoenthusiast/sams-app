import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CompetencyDashboard } from "./CompetencyDashboard";

export const dynamic = "force-dynamic";

const LEVEL_XP: Record<string, number> = {
  Observer: 0, Bronze: 10, Silver: 50, Gold: 200, Platinum: 500, Black: 1000,
};

function getLevelFromXP(xp: number): string {
  if (xp >= LEVEL_XP.Black) return "Black";
  if (xp >= LEVEL_XP.Platinum) return "Platinum";
  if (xp >= LEVEL_XP.Gold) return "Gold";
  if (xp >= LEVEL_XP.Silver) return "Silver";
  if (xp >= LEVEL_XP.Bronze) return "Bronze";
  return "Observer";
}

function getNextLevelFromXP(xp: number): { name: string; needed: number } {
  const levels = ["Observer", "Bronze", "Silver", "Gold", "Platinum", "Black"];
  for (const lvl of levels) {
    if (xp < LEVEL_XP[lvl]) return { name: lvl, needed: LEVEL_XP[lvl] - xp };
  }
  return { name: "Black", needed: 0 };
}

export default async function GamificationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id;
  const userName = (session.user as any).name || "User";

  // Overall XP
  const total = await prisma.pointTransaction.aggregate({ where: { userId }, _sum: { points: true } });
  const overallXP = total._sum.points || 0;

  // Per-track data
  const tracks = await prisma.$queryRawUnsafe<Array<{ paName: string; xp: number }>>(
    `SELECT ga."attributeName" as "paName", COALESCE(SUM(pt.points), 0) as xp
     FROM "GameAttribute" ga
     LEFT JOIN "PointTransaction" pt ON pt."gameAttributeId" = ga.id AND pt."userId" = $1
     WHERE ga."attributeStatus" = 'Active'
     GROUP BY ga."attributeName"
     ORDER BY xp DESC`,
    userId
  );

  // Earned badges
  const badges = await prisma.userAchievement.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: { earnedAt: "desc" },
  });

  // Recent activity
  const recent = await prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // XP source breakdown
  const xpSources = await prisma.$queryRawUnsafe<Array<{ source: string; total: number }>>(
    `SELECT
       CASE
         WHEN reason LIKE 'Conduct Assurance%' THEN 'Assessments'
         WHEN reason LIKE 'Domain XP%' THEN 'Domain XP'
         WHEN reason LIKE '%interview%' OR reason LIKE '%Interview%' THEN 'Interviews'
         ELSE 'Other'
       END as source,
       SUM(points)::int as total
     FROM "PointTransaction"
     WHERE "userId" = $1
     GROUP BY
       CASE
         WHEN reason LIKE 'Conduct Assurance%' THEN 'Assessments'
         WHEN reason LIKE 'Domain XP%' THEN 'Domain XP'
         WHEN reason LIKE '%interview%' OR reason LIKE '%Interview%' THEN 'Interviews'
         ELSE 'Other'
       END
     ORDER BY total DESC`,
    userId
  );

  // Track level distribution
  const trackLevels = tracks.map(t => ({
    paName: t.paName,
    xp: t.xp,
    level: getLevelFromXP(t.xp),
    nextLevel: getNextLevelFromXP(t.xp),
    pa: pas.find(p => p.name === t.paName),
  }));

  // Recommendations: tracks closest to next level
  const recommendations = trackLevels
    .filter(t => t.nextLevel.needed > 0)
    .sort((a, b) => a.nextLevel.needed - b.nextLevel.needed)
    .slice(0, 3);

  // Level counts
  const levelCounts: Record<string, number> = {};
  trackLevels.forEach(t => {
    levelCounts[t.level] = (levelCounts[t.level] || 0) + 1;
  });

  // Process Areas for track mapping
  const pas = await prisma.processArea.findMany({
    select: { id: true, name: true, abbreviatedName: true },
  });

  return (
    <CompetencyDashboard
      userName={userName}
      overallXP={overallXP}
      tracks={JSON.parse(JSON.stringify(tracks))}
      badges={JSON.parse(JSON.stringify(badges))}
      recent={JSON.parse(JSON.stringify(recent))}
      processAreas={pas}
      xpSources={JSON.parse(JSON.stringify(xpSources))}
      recommendations={JSON.parse(JSON.stringify(recommendations))}
      levelCounts={levelCounts}
    />
  );
}
