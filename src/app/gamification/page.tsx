import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CompetencyDashboard } from "./CompetencyDashboard";

export const dynamic = "force-dynamic";

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
    />
  );
}
