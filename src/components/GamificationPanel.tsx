import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";

type BadgeInfo = { name: string; description?: string; rarity: string; earnedAt?: string };
type LeaderboardEntry = { username: string; totalPoints: number; rank: number };
type Props = {
  totalPoints: number;
  dailyStreak?: number;
  recentBadges?: BadgeInfo[];
  leaderboard?: LeaderboardEntry[];
  userRank?: number;
  nextBadge?: { name: string; progress: number; target: number };
};

const rarityColors: Record<string, string> = {
  Common: "bg-slate-100 text-slate-700",
  Uncommon: "bg-green-100 text-green-800",
  Rare: "bg-blue-100 text-blue-800",
  Epic: "bg-purple-100 text-purple-800",
  Legendary: "bg-amber-100 text-amber-800",
};

export function GamificationPanel({ totalPoints, dailyStreak = 0, recentBadges = [], leaderboard = [], userRank, nextBadge }: Props) {
  return (
    <div className="space-y-4">
      <Card padding="sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">🏆 Gamification</h2>
        <div className="space-y-3">
          <div>
            <div className="text-3xl font-bold text-slate-900">{totalPoints.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Total Points</div>
          </div>
          {dailyStreak > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <span>🔥</span>
              <span>{dailyStreak} day streak</span>
            </div>
          )}
        </div>
      </Card>

      {nextBadge && (
        <Card title="Next Badge" padding="sm">
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-900">{nextBadge.name}</div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, (nextBadge.progress / nextBadge.target) * 100)}%` }} />
              </div>
              <span className="text-xs font-medium text-slate-600">{nextBadge.progress}/{nextBadge.target}</span>
            </div>
          </div>
        </Card>
      )}

      {recentBadges.length > 0 && (
        <Card title="Recent Badges" padding="sm">
          <div className="space-y-2">
            {recentBadges.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-lg">🏅</span>
                <div>
                  <div className="text-sm font-medium text-slate-900">{b.name}</div>
                  <div className="flex gap-2">
                    <Badge variant="default" size="sm" className={rarityColors[b.rarity] ?? ""}>{b.rarity}</Badge>
                    {b.earnedAt && <span className="text-xs text-slate-400">{new Date(b.earnedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {leaderboard.length > 0 && (
        <Card title="Leaderboard" padding="sm">
          <div className="space-y-1">
            {leaderboard.map((entry) => (
              <div key={entry.rank} className={`flex items-center justify-between py-1 px-2 rounded text-sm ${entry.rank === userRank ? "bg-blue-50 font-medium" : ""}`}>
                <span className="flex items-center gap-2">
                  <span className="text-slate-400 w-5 text-right">{entry.rank}.</span>
                  <span className={entry.rank <= 3 ? "font-semibold" : ""}>{entry.username}</span>
                </span>
                <span className="text-slate-600">{entry.totalPoints.toLocaleString()} pts</span>
              </div>
            ))}
          </div>
          {userRank && (
            <p className="mt-2 text-xs text-slate-500 text-center">Your rank: #{userRank}</p>
          )}
        </Card>
      )}
    </div>
  );
}
