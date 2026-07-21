import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { HealthIndicator } from "@/components/HealthIndicator";
import { StatusBadge } from "@/components/StatusBadge";
import { GamificationPanel } from "@/components/GamificationPanel";
import { AssessmentCard } from "@/components/AssessmentCard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = (session.user as { id?: string }).id;
  const userName = (session.user as { name?: string }).name ?? "Unknown";
  const companyId = await getSelectedCompanyId();

  // Process areas with health data
  const processAreas = await prisma.processArea.findMany({
    where: companyId ? { companyId } : {},
    include: {
      standardRef: true,
      controls: {
        include: {
          controlAssignments: {
            where: { effective: { not: null } },
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Group by standard
  const byStandard = new Map<string, typeof processAreas>();
  for (const pa of processAreas) {
    const std = pa.standardRef?.standard ?? pa.standard ?? "Other";
    if (!byStandard.has(std)) byStandard.set(std, []);
    byStandard.get(std)!.push(pa);
  }

  // Compute health per PA
  const paHealth = processAreas.map((pa) => {
    const total = pa.controls.length;
    const effective = pa.controls.filter((c) =>
      c.controlAssignments.some((ca) => ca.effective === "Effective")
    ).length;
    const pct = total > 0 ? Math.round((effective / total) * 100) : 0;
    return { ...pa, total, effective, pct };
  });

  // My assessments
  const myAssessments = userId
    ? await prisma.assessment.findMany({
        where: { assessorId: userId, ...(companyId ? { companyId } : {}) },
        include: { activityType: true, _count: { select: { samples: true, findings: true } } },
        orderBy: { startDate: "desc" },
        take: 10,
      })
    : [];

  // Gamification
  const [userRecord, pointsAgg, recentBadgesRaw, leaderboardRaw] = userId ? await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { dailyPointStreak: true } }),
    prisma.pointTransaction.aggregate({ where: { userId }, _sum: { points: true } }),
    prisma.userAchievement.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: "desc" },
      take: 5,
    }),
    prisma.$queryRawUnsafe<Array<{ username: string; totalPoints: number; rank: number }>>(
      `SELECT username, total_points as "totalPoints", RANK() OVER (ORDER BY total_points DESC) as rank
       FROM (SELECT u.username, COALESCE(SUM(pt.points), 0) as total_points
             FROM "User" u LEFT JOIN "PointTransaction" pt ON pt."userId" = u.id
             WHERE u.username != 'admin'
             GROUP BY u.id, u.username) sub
       ORDER BY total_points DESC LIMIT 10`
    ),
  ]) : [null, { _sum: { points: 0 } }, [], []];

  const totalPoints = pointsAgg._sum.points ?? 0;
  const dailyStreak = userRecord?.dailyPointStreak ?? 0;

  const recentBadges = recentBadgesRaw.map((ua) => ({
    name: ua.badge.badgeName,
    description: ua.badge.description ?? undefined,
    rarity: ua.badge.rarity,
    earnedAt: ua.earnedAt?.toISOString(),
  }));

  const leaderboard = leaderboardRaw.map((r) => ({
    username: r.username,
    totalPoints: Number(r.totalPoints),
    rank: Number(r.rank),
  }));

  const userRank = leaderboard.find((e) => e.username === userName)?.rank;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card title="📊 Process Health" subtitle="Control effectiveness by process area">
            {[...byStandard.entries()].map(([std, pas]) => (
              <div key={std} className="mb-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{std}</h3>
                <div className="space-y-1.5">
                  {pas.map((pa) => {
                    const h = paHealth.find((p) => p.id === pa.id)!;
                    return (
                      <Link
                        key={pa.id}
                        href={`/setup/processdetails/${pa.id}`}
                        className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50"
                      >
                        <span className="text-sm text-slate-800">{pa.name}</span>
                        <span className="flex items-center gap-2 text-xs text-slate-500">
                          {h.effective}/{h.total}
                          <HealthIndicator score={h.pct} size="sm" />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {processAreas.length === 0 && (
              <p className="text-sm text-slate-400">No process areas found for the selected company.</p>
            )}
          </Card>

          <Card title="⚡ Quick Actions" padding="sm">
            <div className="flex flex-wrap gap-2">
              <Link href="/fla/new" className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 inline-flex items-center gap-1">
                + New Assessment
              </Link>
              <Link href="/setup/process-areas" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1">
                📋 Process Areas
              </Link>
              <Link href="/setup/controls" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1">
                🔍 Browse Controls
              </Link>
              <Link href="/help" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1">
                ❓ Help
              </Link>
            </div>
          </Card>

          <Card title="📋 My Assessments" actions={<Link href="/fla/new" className="text-sm font-medium text-blue-700 hover:underline">+ New Assessment</Link>}>
            {myAssessments.length === 0 ? (
              <p className="text-sm text-slate-400">No assessments yet. Create your first one.</p>
            ) : (
              <div className="space-y-2">
                {myAssessments.map((a) => (
                  <AssessmentCard
                    key={a.id}
                    id={a.id}
                    name={a.name}
                    status={a.status}
                    activityTypeName={a.activityType.name}
                    startDate={a.startDate}
                    samplesCount={a._count.samples}
                    findingsCount={a._count.findings}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          <GamificationPanel
            totalPoints={totalPoints}
            dailyStreak={dailyStreak}
            recentBadges={recentBadges}
            leaderboard={leaderboard}
            userRank={userRank}
            nextBadge={totalPoints < 10 ? { name: "First Assessment", progress: totalPoints, target: 10 }
              : totalPoints < 50 ? { name: "Assessment Master", progress: totalPoints, target: 50 }
              : totalPoints < 100 ? { name: "Control Champion", progress: totalPoints, target: 100 }
              : undefined}
          />
        </div>
      </div>
    </div>
  );
}
