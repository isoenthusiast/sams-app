"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";

type BadgeData = {
  id: string;
  badgeName: string;
  description: string | null;
  rarity: string;
  earnedCount: number;
};

type Props = {
  badges: BadgeData[];
};

export function BadgesView({ badges }: Props) {
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gamification/award", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Generate failed");
      setMsg({ type: "ok", text: d.message || "Badges generated." });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Generate failed" });
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear ALL badges from ALL users? This cannot be undone.")) return;
    setClearing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gamification/award?clear=true", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Clear failed");
      }
      setMsg({ type: "ok", text: "All badges cleared." });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Clear failed" });
    } finally {
      setClearing(false);
    }
  };

  const rarityColors: Record<string, string> = {
    Common: "bg-slate-100 text-slate-700",
    Uncommon: "bg-green-100 text-green-700",
    Rare: "bg-blue-100 text-blue-700",
    Epic: "bg-purple-100 text-purple-700",
    Legendary: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={generating} onClick={handleGenerate}>
          {generating ? "Generating…" : "🎖 Generate Badges"}
        </Button>
        <Button variant="danger" size="sm" disabled={clearing} onClick={handleClear}>
          {clearing ? "Clearing…" : "🗑 Clear All Badges"}
        </Button>
      </div>

      {msg && (
        <div className={`text-sm px-3 py-2 rounded ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`} role="alert">
          {msg.text}
        </div>
      )}

      <p className="text-sm text-slate-500">{badges.length} badge definition(s)</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b) => (
          <Card key={b.id} padding="sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-900">{b.badgeName}</div>
                {b.description && <div className="text-xs text-slate-500 mt-1">{b.description}</div>}
              </div>
              <Badge variant="default" size="sm" className={rarityColors[b.rarity] ?? ""}>
                {b.rarity}
              </Badge>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Earned by {b.earnedCount} user{b.earnedCount !== 1 ? "s" : ""}
            </div>
          </Card>
        ))}
        {badges.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-slate-400">No badges defined yet.</p>
        )}
      </div>
    </div>
  );
}
