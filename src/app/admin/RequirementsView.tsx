"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { CollapsibleSection } from "@/components/CollapsibleSection";

type ReqData = {
  rId: number; requirementId: string; clauseContent: string;
  standard: string; processAreaName: string; processAreaId: string;
  controls: { id: string; name: string; controlType: string }[];
};

type Props = { requirements: ReqData[]; standards: { standard: string }[] };

export function RequirementsView({ requirements, standards }: Props) {
  const [filter, setFilter] = useState("");
  const [stdFilter, setStdFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ requirementId: string; clauseContent: string }>({ requirementId: "", clauseContent: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [data, setData] = useState(requirements);

  const filtered = useMemo(() => data.filter((r) => {
    if (filter && !r.requirementId.toLowerCase().includes(filter.toLowerCase()) && !r.clauseContent.toLowerCase().includes(filter.toLowerCase())) return false;
    if (stdFilter && r.standard !== stdFilter) return false;
    return true;
  }), [data, filter, stdFilter]);

  // Group filtered by Standard → ProcessArea
  const grouped = useMemo(() => {
    const byStd = new Map<string, Map<string, ReqData[]>>();
    for (const r of filtered) {
      if (!byStd.has(r.standard)) byStd.set(r.standard, new Map());
      const byPA = byStd.get(r.standard)!;
      if (!byPA.has(r.processAreaName)) byPA.set(r.processAreaName, []);
      byPA.get(r.processAreaName)!.push(r);
    }
    return [...byStd.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggle = (rId: number) => { setExpanded((p) => { const n = new Set(p); if (n.has(rId)) n.delete(rId); else n.add(rId); return n; }); };
  const startEdit = (r: ReqData) => { setEditing(r.rId); setEditForm({ requirementId: r.requirementId, clauseContent: r.clauseContent }); setMsg(null); };

  const saveEdit = async (rId: number) => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/table/Requirement/${rId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm) });
      if (!res.ok) throw new Error("Save failed");
      setData((prev) => prev.map((r) => r.rId === rId ? { ...r, ...editForm } : r));
      setEditing(null); setMsg({ type: "ok", text: "Saved." });
    } catch (err) { setMsg({ type: "err", text: err instanceof Error ? err.message : "Save failed" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]"><Input label="Search" value={filter} onChange={setFilter} placeholder="Search by ID or clause content…" /></div>
        <div className="w-48"><label className="block text-xs font-medium text-slate-600 mb-1">Standard</label>
          <select value={stdFilter} onChange={(e) => setStdFilter(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option value="">All Standards</option>{standards.map((s) => (<option key={s.standard} value={s.standard}>{s.standard}</option>))}</select></div>
      </div>
      <p className="text-sm text-slate-500">{filtered.length} of {data.length} requirement(s)</p>
      {msg && (<div className={`text-sm px-3 py-2 rounded ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</div>)}
      <div className="space-y-2 max-h-[65vh] overflow-y-auto">
        {grouped.map(([stdName, paMap]) => (
          <CollapsibleSection key={stdName} title={stdName} count={[...paMap.values()].flat().length} defaultOpen={false}>
            <div className="space-y-2">
              {[...paMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([paName, reqs]) => (
                <CollapsibleSection key={paName} title={paName} count={reqs.length} defaultOpen={false}>
                  <div className="space-y-1">
                    {reqs.map((r) => {
                      const isExp = expanded.has(r.rId);
                      return (
                        <Card key={r.rId} padding="none" className="overflow-hidden">
                          <button onClick={() => toggle(r.rId)} className="w-full text-left px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                            <div className="flex items-center justify-between">
                              <div><span className="font-semibold text-sm text-slate-900">{r.requirementId}</span>
                                <span className="ml-2 text-xs text-slate-400">{r.controls.length} control(s)</span></div>
                              <span className="text-xs text-slate-300">{isExp ? "▼" : "▶"}</span>
                            </div>
                          </button>
                          {isExp && (
                            <div className="px-4 py-3 border-t border-slate-100 space-y-3">
                              {editing === r.rId ? (
                                <div className="space-y-3">
                                  <Input label="Requirement ID" value={editForm.requirementId} onChange={(v) => setEditForm((f) => ({ ...f, requirementId: v }))} />
                                  <div><label className="block text-xs font-medium text-slate-600 mb-1">Clause Content</label><textarea value={editForm.clauseContent} onChange={(e) => setEditForm((f) => ({ ...f, clauseContent: e.target.value }))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[80px]" /></div>
                                  <div className="flex gap-2"><Button variant="primary" size="sm" disabled={saving} onClick={() => saveEdit(r.rId)}>{saving ? "Saving…" : "Save"}</Button><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button></div>
                                </div>
                              ) : (
                                <><p className="text-sm text-slate-700 whitespace-pre-wrap">{r.clauseContent}</p><Button variant="secondary" size="sm" onClick={() => startEdit(r)}>✏️ Edit</Button></>
                              )}
                              {r.controls.length > 0 && (
                                <div className="border-t border-slate-100 pt-3"><h4 className="text-xs font-medium text-slate-600 mb-2">Associated Controls ({r.controls.length})</h4>
                                  <div className="flex flex-wrap gap-1">{r.controls.map((c) => (<Badge key={c.id} variant="default" size="sm">{c.name} <span className="text-slate-400 ml-1">({c.controlType})</span></Badge>))}</div></div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </CollapsibleSection>
              ))}
            </div>
          </CollapsibleSection>
        ))}
        {grouped.length === 0 && <p className="py-12 text-center text-sm text-slate-400">No requirements match your filter.</p>}
      </div>
    </div>
  );
}
