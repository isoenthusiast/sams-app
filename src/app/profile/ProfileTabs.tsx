"use client";

import { useState } from "react";
import Link from "next/link";
import { CompetencyDashboard } from "@/app/gamification/CompetencyDashboard";
import { UserDetailsTab } from "./UserDetailsTab";

type UserData = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  position: { id: string; title: string; department: { id: string; name: string } | null } | null;
  userCompanies: Array<{ company: { id: string; companyID: string; companyName: string } }>;
  totalPoints: number;
  createdAt: string;
} | null;

type Props = {
  user: UserData;
  userName: string;
  overallXP: number;
  tracks: Array<{ paName: string; xp: number }>;
  badges: Array<{ badge: { badgeName: string; badgeImage?: string | null; level?: string | null; badgeType: string; icon: string }; earnedAt: string }>;
  recent: Array<{ reason: string; points: number; createdAt: string }>;
  processAreas: Array<{ id: string; name: string; abbreviatedName?: string | null }>;
  xpSources: Array<{ source: string; total: number }>;
  recommendations: Array<{ paName: string; xp: number; level: string; nextLevel: { name: string; needed: number }; pa?: { id: string; name: string; abbreviatedName?: string | null } }>;
  levelCounts: Record<string, number>;
};

export function ProfileTabs(props: Props) {
  const { user, userName, overallXP, tracks, badges, recent, processAreas, xpSources, recommendations, levelCounts } = props;
  const [activeTab, setActiveTab] = useState<"overview" | "details">("overview");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
          <p className="text-sm text-slate-500">{userName}</p>
        </div>
        <Link href="/fla" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200 flex gap-1">
        {(["overview", "details"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "overview" ? "📊 Overview" : "👤 User Details"}
          </button>
        ))}
      </div>

      {/* ── Overview: Gamification Dashboard ── */}
      {activeTab === "overview" && (
        <CompetencyDashboard
          userName={userName}
          overallXP={overallXP}
          tracks={tracks}
          badges={badges}
          recent={recent}
          processAreas={processAreas}
          xpSources={xpSources}
          recommendations={recommendations}
          levelCounts={levelCounts}
        />
      )}

      {/* ── User Details ── */}
      {activeTab === "details" && (
        <UserDetailsTab user={user} />
      )}
    </div>
  );
}
