import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { getCompanyAttestationStates } from "@/lib/mic-attestations";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { StatusBadge } from "@/components/StatusBadge";
import { GamificationPanel } from "@/components/GamificationPanel";
import { GamificationWidget } from "@/components/GamificationWidget";
import { AssessmentCard } from "@/components/AssessmentCard";
import { ActionRowClient } from "@/components/ActionRowClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = (session.user as { id?: string }).id;
  const userName = (session.user as { name?: string }).name ?? "Unknown";

  // Company selection: URL param takes precedence over cookie
  const sp = await searchParams;
  const cookieCompanyId = await getSelectedCompanyId();
  const companyId = sp.companyId || cookieCompanyId;

  // Process areas with coverage data (SOC-based, light query)
  let processAreas: any[] = [];
  try {
    processAreas = await prisma.processArea.findMany({
      where: companyId ? { companyId } : {},
      include: {
        standardRef: true,
        requirements: {
          where: { applicable: true },
          select: { rId: true, socStatus: true },
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

  // Compliance coverage per PA = % of requirements Fully Comply (SOC)
  const paCoverage = processAreas.map((pa: any) => {
    const reqs = pa.requirements ?? [];
    const fully = reqs.filter((r: any) => r.socStatus === "FullyComply").length;
    const assessed = reqs.filter((r: any) => r.socStatus !== null).length;
    const pct = assessed > 0 ? Math.round((fully / assessed) * 100) : null;
    return { ...pa, fully, assessed, pct };
  });

  // MIC Ritual (SAMS-014): DERIVED attestation state per PA — same helper the
  // portal + digest use, so the dashboard chip agrees with both.
  let attestationByPa = new Map<string, string>();
  try {
    if (companyId) {
      const states = await getCompanyAttestationStates(companyId);
      attestationByPa = new Map(states.map((s) => [s.processAreaId, s.state]));
    }
  } catch {
    attestationByPa = new Map<string, string>();
  }

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

  // My Actions — filtered by selected company via finding → assessment
  const myActions = userName
    ? await prisma.action.findMany({
        where: {
          actionParty: userName,
          ...(companyId
            ? { finding: { assessment: { companyId } } }
            : {}),
        },
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
          <Link href="/fla/all" className="rounded-md border border-blue-800 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50 inline-flex items-center gap-1">
            📋 All Assessments
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

      {/* Gamification Widget */}
      <div className="mb-4">
        <GamificationWidget userId={userId} />
      </div>

      {/* Two-column dashboard */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Process Health */}
        <div>
          <Card title="📊 Process Health" subtitle="Requirements coverage by process area (% Fully Comply)" className="h-full">
            {[...byStandard.entries()].map(([std, pas]) => (
              <CollapsibleSection key={std} title={std} count={pas.length}>
                {pas.map((pa) => {
                  const h = paCoverage.find((p: any) => p.id === pa.id)!;
                  return (
                    <Link
                      key={pa.id}
                      href={`/setup/processdetails/${pa.id}`}
                      target="_blank"
                      className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50"
                    >
                      <span className="text-sm text-slate-800">{pa.name}</span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">{h.fully}/{h.assessed} fully comply</span>
                        {h.pct !== null ? (
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${h.pct >= 80 ? "bg-green-100 text-green-800" : h.pct >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                            {h.pct}%
                          </span>
                        ) : (
                          <span className="rounded-full px-2 py-0.5 font-semibold bg-slate-100 text-slate-500">—</span>
                        )}
                        {(() => {
                          const state = attestationByPa.get(pa.id) ?? "attested";
                          if (state === "overdue") return <span title="SOC attestation overdue" className="rounded-full px-2 py-0.5 font-semibold bg-red-100 text-red-800">attest overdue</span>;
                          if (state === "dueSoon") return <span title="SOC attestation due soon" className="rounded-full px-2 py-0.5 font-semibold bg-amber-100 text-amber-800">due soon</span>;
                          return <span title="SOC attestation in date" className="rounded-full px-2 py-0.5 font-semibold bg-green-100 text-green-800">attested</span>;
                        })()}
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
