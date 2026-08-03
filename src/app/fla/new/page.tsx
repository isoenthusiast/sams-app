"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type HierarchyControl = { id: string; name: string; controlType: string; mappingId: string };
type Requirement = { rId: number; requirementId: string; clauseContent: string; controls: HierarchyControl[]; controlCount: number };
type ProcessArea = { id: string; name: string; totalControls: number; requirements: Requirement[] };
type Standard = { standard: string; standardId: string; processAreas: ProcessArea[] };

export default function NewAssessmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hierarchy, setHierarchy] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedStd, setExpandedStd] = useState<Set<string>>(new Set());
  const [expandedPA, setExpandedPA] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/assessment-hierarchy")
      .then((r) => r.json())
      .then((d) => {
        setHierarchy(d.hierarchy || []);
        if (d.hierarchy?.length > 0) setExpandedStd(new Set([d.hierarchy[0].standardId]));
      })
      .finally(() => setLoading(false));
  }, []);

  const controlMap = useMemo(() => {
    const map = new Map<string, { name: string; type: string; paName: string; reqId: string }>();
    for (const s of hierarchy)
      for (const pa of s.processAreas)
        for (const req of pa.requirements)
          for (const c of req.controls)
            map.set(c.id, { name: c.name, type: c.controlType, paName: pa.name, reqId: req.requirementId });
    return map;
  }, [hierarchy]);

  const selectedGroups = useMemo(() => {
    const groups = new Map<string, Map<string, Map<string, { id: string; name: string; type: string }[]>>>();
    for (const cid of checked) {
      const info = controlMap.get(cid);
      if (!info) continue;
      let stdName = "Unknown";
      for (const s of hierarchy)
        for (const pa of s.processAreas)
          if (pa.name === info.paName) { stdName = s.standard; break; }
      if (!groups.has(stdName)) groups.set(stdName, new Map());
      const paMap = groups.get(stdName)!;
      if (!paMap.has(info.paName)) paMap.set(info.paName, new Map());
      const reqMap = paMap.get(info.paName)!;
      if (!reqMap.has(info.reqId)) reqMap.set(info.reqId, []);
      reqMap.get(info.reqId)!.push({ id: cid, name: info.name, type: info.type });
    }
    return groups;
  }, [checked, controlMap, hierarchy]);

  const toggleCheck = (cid: string) =>
    setChecked((p) => { const n = new Set(p); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

  const selectAllInReq = (controls: HierarchyControl[]) =>
    setChecked((p) => { const n = new Set(p); controls.forEach((c) => n.add(c.id)); return n; });

  const selectAllInPA = (pa: ProcessArea) =>
    setChecked((p) => { const n = new Set(p); pa.requirements.forEach((r) => r.controls.forEach((c) => n.add(c.id))); return n; });

  const selectAllInStd = (s: Standard) =>
    setChecked((p) => { const n = new Set(p); s.processAreas.forEach((pa) => pa.requirements.forEach((r) => r.controls.forEach((c) => n.add(c.id)))); return n; });

  const handleCreate = async () => {
    if (!name.trim()) { setError("Assessment name is required"); return; }
    if (checked.size === 0) { setError("Select at least one control"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/assessments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), controlIds: Array.from(checked) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const assessment = await res.json();
      router.push(`/fla/${assessment.id}?adopt=1`);
    } catch (err: any) { setError(err.message); setSaving(false); }
  };

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-6"><p className="text-sm text-slate-400">Loading…</p></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">New Assessment</h1>
      <div className="mb-4"><Input label="Assessment Name" value={name} onChange={setName} required placeholder="e.g., 2026 SMDS IMS Internal Audit" /></div>

      <div className="flex gap-4 h-[70vh]">
        {/* LEFT: Hierarchy */}
        <div className="flex-1 flex flex-col min-w-0 border border-slate-200 rounded-lg bg-white">
          <div className="px-4 py-3 border-b border-slate-200 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">📂 Standards → Process Areas → Requirements → Controls</h2>
              <span className="text-xs text-slate-400">{checked.size} selected</span>
            </div>
            <input type="text" placeholder="Search controls…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="mt-2 w-full rounded border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {hierarchy.map((s) => {
              const stdExpanded = expandedStd.has(s.standardId);
              return (
                <div key={s.standardId} className="mb-1">
                  <button onClick={() => setExpandedStd((p) => { const n = new Set(p); n.has(s.standardId) ? n.delete(s.standardId) : n.add(s.standardId); return n; })}
                    className="w-full text-left flex items-center gap-1 px-2 py-1.5 rounded hover:bg-slate-50 text-sm">
                    <span className="text-slate-400 text-xs">{stdExpanded ? "▼" : "▶"}</span>
                    <span className="font-semibold text-slate-800 truncate flex-1">{s.standard}</span>
                    <button onClick={(e) => { e.stopPropagation(); selectAllInStd(s); }}
                      className="text-[10px] text-blue-500 hover:text-blue-700 px-1">All</button>
                  </button>
                  {stdExpanded && s.processAreas.map((pa) => {
                    const paExpanded = expandedPA.has(pa.id);
                    if (search && !pa.requirements.some((r) => r.controls.some((c) => c.name.toLowerCase().includes(search.toLowerCase()))) && !pa.name.toLowerCase().includes(search.toLowerCase())) return null;
                    return (
                      <div key={pa.id} className="ml-4">
                        <button onClick={() => setExpandedPA((p) => { const n = new Set(p); n.has(pa.id) ? n.delete(pa.id) : n.add(pa.id); return n; })}
                          className="w-full text-left flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50 text-sm">
                          <span className="text-slate-400 text-xs">{paExpanded ? "▼" : "▶"}</span>
                          <span className="font-medium text-slate-700 truncate flex-1">{pa.name}</span>
                          <span className="text-[10px] text-slate-400">{pa.totalControls} ctrls</span>
                          <button onClick={(e) => { e.stopPropagation(); selectAllInPA(pa); }}
                            className="text-[10px] text-blue-500 hover:text-blue-700 px-1">All</button>
                        </button>
                        {paExpanded && pa.requirements.map((req) => (
                          <div key={req.rId} className="ml-6">
                            <div className="flex items-center gap-1 px-2 py-0.5 text-xs">
                              <span className="font-medium text-slate-600">{req.requirementId}</span>
                              <span className="text-slate-400">({req.controlCount} ctrl{req.controlCount !== 1 ? "s" : ""})</span>
                              {req.controlCount > 0 && (
                                <button onClick={() => selectAllInReq(req.controls)} className="text-[10px] text-blue-500 hover:text-blue-700 ml-1">All</button>
                              )}
                            </div>
                            {req.controls.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase())).map((c) => (
                              <label key={c.id} className={`ml-4 flex items-center gap-2 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-50 text-xs ${checked.has(c.id) ? "bg-blue-50" : ""}`}>
                                <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggleCheck(c.id)} className="rounded text-blue-600 shrink-0" />
                                <span className="flex-1 truncate">{c.name}</span>
                                <span className="text-slate-400 shrink-0">{c.controlType}</span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {hierarchy.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No controls available. Map controls to requirements first via Admin → Standards → Requirements.</p>}
          </div>
        </div>

        {/* RIGHT: Selected */}
        <div className="w-80 shrink-0 border border-slate-200 rounded-lg bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 shrink-0">
            <h2 className="text-sm font-semibold text-slate-700">📋 Selected ({checked.size})</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
            {selectedGroups.size === 0 ? (
              <p className="text-slate-400 py-4 text-center">Select controls from the left panel.</p>
            ) : (
              [...selectedGroups.entries()].map(([std, paMap]) => (
                <div key={std} className="mb-3">
                  <div className="font-semibold text-slate-700 mb-1">{std}</div>
                  {[...paMap.entries()].map(([pa, reqMap]) => (
                    <div key={pa} className="ml-2 mb-2">
                      <div className="font-medium text-slate-600">{pa}</div>
                      {[...reqMap.entries()].map(([reqId, ctrls]) => (
                        <div key={reqId} className="ml-3">
                          <div className="text-slate-500">{reqId} ({ctrls.length})</div>
                          {ctrls.map((c) => (
                            <div key={c.id} className="ml-3 flex items-center gap-1 text-slate-600">
                              <button onClick={() => toggleCheck(c.id)} className="text-red-400 hover:text-red-600 shrink-0" title="Remove">×</button>
                              <span className="truncate">{c.name}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="px-4 py-3 border-t border-slate-200 shrink-0 space-y-2">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button onClick={handleCreate} disabled={saving || checked.size === 0 || !name.trim()} size="sm" variant="success" className="w-full">
              {saving ? "Creating…" : `✓ Create Assessment (${checked.size} controls)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
