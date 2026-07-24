"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { showToast } from "@/components/Toast";

type Badge = {
  id: string; badgeName: string; description: string; badgeType: string;
  level?: string | null; processAreaId?: string | null;
  processArea?: { name: string; abbreviatedName?: string | null } | null;
  backgroundPrompt?: string | null; foregroundPrompt?: string | null;
  designConfig?: any; badgeImage?: string | null; imageFormat?: string | null;
  rarity: string; icon: string;
};

type ProcessArea = { id: string; name: string; abbreviatedName?: string | null };

const LEVELS = ["Bronze", "Silver", "Gold", "Platinum", "Black"];
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

export function BadgesAdminView() {
  const router = useRouter();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [pas, setPas] = useState<ProcessArea[]>([]);
  const [activeTab, setActiveTab] = useState<"track" | "role" | "special">("track");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Badge | null>(null);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [form, setForm] = useState({
    badgeName: "", description: "", badgeType: "track" as string, level: "", processAreaId: "",
    backgroundPrompt: "", foregroundPrompt: "", icon: "🏅", rarity: "Uncommon",
  });
  const [genFormat, setGenFormat] = useState<"svg" | "png">("png");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/table/AchievementBadge/data").then(r => r.json()),
      fetch("/api/admin/table/ProcessArea/data").then(r => r.json()),
    ]).then(([b, p]) => {
      setBadges(b.rows ?? b.data ?? []);
      setPas(p.rows ?? p.data ?? []);
    }).catch(() => showToast("Failed to load", "error"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = badges.filter(b => b.badgeType === activeTab);

  const openAdd = (type: string) => {
    setEditing(null);
    setAdding(true);
    setForm({ badgeName: "", description: "", badgeType: type, level: "", processAreaId: "", backgroundPrompt: "", foregroundPrompt: "", icon: "🏅", rarity: "Uncommon" });
    if (type === "track") setForm(prev => ({ ...prev, level: "Bronze" }));
  };

  const openEdit = (b: Badge) => {
    setEditing(b);
    setAdding(false);
    setForm({
      badgeName: b.badgeName, description: b.description, badgeType: b.badgeType,
      level: b.level || "", processAreaId: b.processAreaId || "",
      backgroundPrompt: b.backgroundPrompt || "", foregroundPrompt: b.foregroundPrompt || "",
      icon: b.icon, rarity: b.rarity,
    });
  };

  const handleSave = async () => {
    if (!form.badgeName.trim()) { showToast("Name required", "error"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/admin/table/AchievementBadge/${editing.id}` : "/api/admin/table/AchievementBadge/data";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed");
      showToast(editing ? "Updated" : "Created", "success");
      setEditing(null); setAdding(false);
      router.refresh();
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleGenerate = async (badge: Badge, format: "svg" | "png") => {
    setGenerating(badge.id);
    try {
      const res = await fetch("/api/admin/badges/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeId: badge.id, format }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${format.toUpperCase()} generated`, "success");
        router.refresh();
      } else {
        showToast(data.error || "Generation failed", "error");
      }
    } catch { showToast("Generation failed", "error"); }
    finally { setGenerating(null); }
  };

  const handleBulkGenerateTracks = async (format: "svg" | "png") => {
    if (!confirm(`Generate ALL track badges as ${format.toUpperCase()}? This will call the AI for each badge.`)) return;
    const trackBadges = badges.filter(b => b.badgeType === "track");
    for (const b of trackBadges) {
      setGenerating(b.id);
      try {
        await fetch("/api/admin/badges/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ badgeId: b.id, format }),
        });
      } catch { /* continue */ }
    }
    setGenerating(null);
    showToast(`Generated ${trackBadges.length} track badges`, "success");
    router.refresh();
  };

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["track", "role", "special"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ${activeTab === t ? "border-slate-900 text-slate-900 bg-white" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {t === "track" ? "🛡 Track" : t === "role" ? "👤 Role" : "⭐ Special"} ({badges.filter(b => b.badgeType === t).length})
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {activeTab === "track" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => handleBulkGenerateTracks("png")}>🎨 Gen All PNG</Button>
              <Button variant="secondary" size="sm" onClick={() => handleBulkGenerateTracks("svg")}>✏️ Gen All SVG</Button>
            </>
          )}
          <Button variant="primary" size="sm" onClick={() => openAdd(activeTab)}>+ Add Badge</Button>
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.map(b => (
          <Card key={b.id} padding="sm">
            <div className="flex items-center gap-3">
              {b.badgeImage ? (
                <img src={b.badgeImage} alt={b.badgeName} className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg shrink-0">{b.icon}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-800">{b.badgeName}</div>
                <div className="text-xs text-slate-400">
                  {b.level && `${b.level}`}{b.processArea?.name && ` · ${b.processArea.name}`}
                  {b.imageFormat && ` · ${b.imageFormat.toUpperCase()}`}
                  {" · "}{b.rarity}
                </div>
                {b.description && <div className="text-xs text-slate-500 mt-0.5">{b.description}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(b)} className="text-xs text-blue-600 hover:text-blue-800 px-1">Edit</button>
                {b.backgroundPrompt && (
                  <>
                    <button onClick={() => handleGenerate(b, "png")} disabled={generating === b.id}
                      className="text-xs text-emerald-600 hover:text-emerald-800 px-1">
                      {generating === b.id ? "…" : "PNG"}
                    </button>
                    <button onClick={() => handleGenerate(b, "svg")} disabled={generating === b.id}
                      className="text-xs text-violet-600 hover:text-violet-800 px-1">
                      {generating === b.id ? "…" : "SVG"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            No {activeTab} badges yet. Click "+ Add Badge" to create one.
          </p>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={adding || !!editing} onClose={() => { setAdding(false); setEditing(null); }}
        title={editing ? "Edit Badge" : "Add Badge"}>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Badge Name</label>
              <input type="text" value={form.badgeName} onChange={e => setForm({ ...form, badgeName: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Icon</label>
              <input type="text" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Description</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Rarity</label>
              <select value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {form.badgeType === "track" && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-600">Level</label>
                  <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600">Process Area</label>
                  <select value={form.processAreaId} onChange={e => setForm({ ...form, processAreaId: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                    <option value="">— All —</option>
                    {pas.map(p => <option key={p.id} value={p.id}>{p.name}{p.abbreviatedName ? ` (${p.abbreviatedName})` : ""}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Background Prompt</label>
            <textarea value={form.backgroundPrompt} onChange={e => setForm({ ...form, backgroundPrompt: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={3}
              placeholder="Hexagonal shield frame, dark metallic border…" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Foreground Prompt</label>
            <textarea value={form.foregroundPrompt} onChange={e => setForm({ ...form, foregroundPrompt: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={3}
              placeholder="Center icon: torch. Text: 'BRONZE'…" />
          </div>
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
