import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { HealthIndicator } from "@/components/HealthIndicator";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { StatusBadge } from "@/components/StatusBadge";
import { GamificationPanel } from "@/components/GamificationPanel";
import { AssessmentCard } from "@/components/AssessmentCard";
import { ActionRowClient } from "@/components/ActionRowClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = (session.user as { id?: string }).id;
  const userName = (session.user as { name?: string }).name ?? "Unknown";
  const companyId = await getSelectedCompanyId();

  // Process areas with health data — safe fallback
  let processAreas: any[] = [];
  try {
    processAreas = await prisma.processArea.findMany({
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
  } catch {
    processAreas = [];
  }

  // Group by standard
  const byStandard = new Map<string, any[]>();
  for (const pa of processAreas) {
    const std = pa.standardRef?.standard ?? pa.standard ?? "Other";
    if (!byStandard.has(std)) byStandard.set(std, []);
    byStandard.get(std)!.push(pa);
  }

  // Compute health per PA
  const paHealth = processAreas.map((pa: any) => {
    const total = pa.controls.length;
    const effective = pa.controls.filter((c: any) =>
      c.controlAssignments.some((ca: any) => ca.effective === "Effective")
    ).length;
    const pct = total > 0 ? Math.round((effective / total) * 100) : 0;
    return { ...pa, total, effective, pct };
  });

  // My assessments — via assessor junction (multi-assessor support)
  const myAssessments = userId
    ? await prisma.assessment.findMany({
        where: {
          OR: [
            { assessorId: userId },
            { assessorLinks: { some: { userId } } },
          ],
          ...(companyId ? { companyId } : {}),
        },
        include: { activityType: true, _count: { select: { samples: true, findings: true } } },
        orderBy: { startDate: "desc" },
        take: 10,
      })
    : [];

  // Gamification — safe fallback
  let totalPoints = 0;
  let dailyStreak = 0;
  let recentBadges: any[] = [];
  let leaderboard: any[] = [];
  try {
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

    totalPoints = pointsAgg._sum.points ?? 0;
    dailyStreak = userRecord?.dailyPointStreak ?? 0;

    recentBadges = (recentBadgesRaw || [])
      .filter((ua: any) => ua.badge != null)
      .map((ua: any) => ({
        name: ua.badge.badgeName,
        description: ua.badge.description ?? undefined,
        rarity: ua.badge.rarity,
        earnedAt: ua.earnedAt?.toISOString(),
      }));

    leaderboard = (leaderboardRaw || []).map((r: any) => ({
      username: r.username,
      totalPoints: Number(r.totalPoints),
      rank: Number(r.rank),
    }));
  } catch {
    // gamification data is optional — page renders without it
  }

  const userRank = leaderboard.find((e) => e.username === userName)?.rank;

  // My Actions
  const myActions = userName
    ? await prisma.action.findMany({
        where: { actionParty: userName },
        include: {
          finding: {
            include: {
              assessment: { include: { activityType: true, assessor: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdDate: "desc" },
        take: 20,
      })
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Quick Actions + Gamification compact bar */}
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2 flex-1">
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
        <div className="flex items-center gap-3 text-sm">
          <span className="font-bold text-slate-900">{totalPoints.toLocaleString()} pts</span>
          {dailyStreak > 0 && <span className="text-amber-700">🔥 {dailyStreak}</span>}
          {userRank && <span className="text-slate-500">Rank #{userRank}</span>}
        </div>
      </div>

      {/* Two-column dashboard */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Process Health */}
        <div>
          <Card title="📊 Process Health" subtitle="Control effectiveness by process area" className="h-full">
            {[...byStandard.entries()].map(([std, pas]) => (
              <CollapsibleSection key={std} title={std} count={pas.length}>
                {pas.map((pa) => {
                  const h = paHealth.find((p: any) => p.id === pa.id)!;
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
              </CollapsibleSection>
            ))}
            {processAreas.length === 0 && (
              <p className="text-sm text-slate-400">No process areas found for the selected company.</p>
            )}
          </Card>
        </div>

        {/* Right: My Assessments + My Actions */}
        <div className="space-y-6">
          <Card title="📋 My Assessments" actions={<Link href="/fla/new" className="text-sm font-medium text-blue-700 hover:underline">+ New</Link>}>
            {myAssessments.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No assessments yet.</p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
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

          <Card title="✅ My Actions" subtitle={myActions.length > 0 ? `${myActions.length} assigned` : ""}>
            {myActions.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No actions assigned to you.</p>
            ) : (
              <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {myActions.map((act) => (
                  <ActionRowClient key={act.id} action={act} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
