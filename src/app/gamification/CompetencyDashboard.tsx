"use client";

import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import Link from "next/link";

const LEVELS = ["Observer", "Bronze", "Silver", "Gold", "Platinum", "Black"];
const LEVEL_COLORS: Record<string, string> = {
  Observer: "bg-slate-200", Bronze: "bg-amber-600", Silver: "bg-slate-400",
  Gold: "bg-yellow-500", Platinum: "bg-cyan-500", Black: "bg-slate-900",
};
const LEVEL_XP: Record<string, number> = {
  Observer: 0, Bronze: 10, Silver: 50, Gold: 200, Platinum: 500, Black: 1000,
};

function getLevel(xp: number): string {
  if (xp >= LEVEL_XP.Black) return "Black";
  if (xp >= LEVEL_XP.Platinum) return "Platinum";
  if (xp >= LEVEL_XP.Gold) return "Gold";
  if (xp >= LEVEL_XP.Silver) return "Silver";
  if (xp >= LEVEL_XP.Bronze) return "Bronze";
  return "Observer";
}

function getNextLevel(xp: number): { name: string; needed: number } {
  for (const lvl of LEVELS) {
    if (xp < LEVEL_XP[lvl]) return { name: lvl, needed: LEVEL_XP[lvl] - xp };
  }
  return { name: "Black", needed: 0 };
}

type Props = {
  userName: string;
  overallXP: number;
  tracks: Array<{ paName: string; xp: number }>;
  badges: Array<{ badge: { badgeName: string; badgeImage?: string | null; level?: string | null; badgeType: string; icon: string }; earnedAt: string }>;
  recent: Array<{ reason: string; points: number; createdAt: string }>;
  processAreas: Array<{ id: string; name: string; abbreviatedName?: string | null }>;
};

export function CompetencyDashboard({ userName, overallXP, tracks, badges, recent, processAreas }: Props) {
  const trackMap = new Map(processAreas.map(p => [p.name, p]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Competency Dashboard</h1>
          <p className="text-sm text-slate-500">{userName} · {overallXP} Total XP</p>
        </div>
        <Link href="/fla" className="text-sm text-blue-600 hover:underline">← Back</Link>
      </div>

      {/* ── Track Cards ── */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Mastery Tracks</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {tracks.map(t => {
            const level = getLevel(t.xp);
            const next = getNextLevel(t.xp);
            const pa = trackMap.get(t.paName);
            const pct = Math.min(100, next.name === "Black" && t.xp >= LEVEL_XP.Black ? 100 : Math.round((1 - next.needed / LEVEL_XP[next.name]) * 100));

            return (
              <Card key={t.paName} padding="sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-800">
                      {pa?.abbreviatedName || t.paName}
                    </div>
                    <div className="text-xs text-slate-400">{t.paName}</div>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-xs font-bold text-white ${LEVEL_COLORS[level]}`}>
                    {level}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mb-1">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>{t.xp} XP</span>
                    {next.name !== "Black" || t.xp < LEVEL_XP.Black ? (
                      <span>{next.name}: {LEVEL_XP[next.name]} XP</span>
                    ) : (
                      <span>Max</span>
                    )}
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${LEVEL_COLORS[next.name] || LEVEL_COLORS[level]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {next.needed > 0 && (
                  <div className="text-[10px] text-slate-400">{next.needed} XP to {next.name}</div>
                )}
                {next.needed === 0 && level === "Black" && (
                  <div className="text-[10px] text-slate-400">🏆 Maximum level reached</div>
                )}
              </Card>
            );
          })}
          {tracks.length === 0 && (
            <div className="col-span-2 py-8 text-center text-sm text-slate-400">
              No track data yet. Complete an assessment to start earning XP.
            </div>
          )}
        </div>
      </div>

      {/* ── Badges ── */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Badges Earned ({badges.length})</h2>
        {badges.length === 0 ? (
          <p className="text-sm text-slate-400">No badges yet. Reach Bronze in any track to earn your first.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {badges.map(b => (
              <div key={b.badge.badgeName + b.earnedAt} className="text-center">
                {b.badge.badgeImage ? (
                  <img src={b.badge.badgeImage} alt={b.badge.badgeName} className="w-16 h-16 rounded-xl object-cover shadow-sm" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center text-2xl shadow-sm">{b.badge.icon}</div>
                )}
                <div className="text-[11px] font-medium text-slate-700 mt-1">{b.badge.badgeName}</div>
                {b.badge.level && <div className="text-[10px] text-slate-400">{b.badge.level}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Activity ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Recent Activity</h2>
        <div className="space-y-1">
          {recent.slice(0, 15).map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-slate-50 rounded text-xs">
              <span className="text-slate-600 truncate flex-1 mr-2">{r.reason}</span>
              <span className="font-medium text-emerald-600 shrink-0">+{r.points}</span>
              <span className="text-slate-400 ml-2 shrink-0 w-16 text-right">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
          {recent.length === 0 && (
            <p className="text-sm text-slate-400 py-4">No activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
