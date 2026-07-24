"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/Card";

type Props = {
  userId?: string;
};

export function GamificationWidget({ userId }: Props) {
  const [data, setData] = useState<{ overallXP: number; latestTrack: string | null; tracks: Array<{ name: string; xp: number; level: string }> } | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/gamification/stats?userId=${userId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, [userId]);

  if (!data) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg text-white text-sm">
      <div className="shrink-0">
        <div className="text-lg font-bold">{data.overallXP}</div>
        <div className="text-[10px] text-slate-400">Total XP</div>
      </div>
      {data.latestTrack && (
        <div className="flex-1 min-w-0 border-l border-slate-600 pl-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">Latest Track</div>
          <div className="font-medium truncate">{data.latestTrack}</div>
        </div>
      )}
      {data.tracks.length > 0 && (
        <div className="hidden sm:flex gap-1.5">
          {data.tracks.slice(0, 3).map(t => (
            <div key={t.name} className="text-center px-2 py-1 bg-slate-600/50 rounded">
              <div className="text-[9px] text-slate-400 truncate max-w-[60px]">{t.name}</div>
              <div className="text-xs font-semibold">{t.level || "Obs"}</div>
              <div className="text-[9px] text-slate-400">{t.xp}xp</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
