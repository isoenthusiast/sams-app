"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";
import { CollapsibleSection } from "@/components/CollapsibleSection";

type KbEntry = {
  kID: string; knowledgeName: string;
  processAreaId: string | null; processAreaName: string | null; standardName: string | null;
};
type ProcessArea = { id: string; name: string; standardId?: string | null; standardRef?: { id: string; standard: string } | null };
type Standard = { id: string; standard: string; companyId?: string | null };
type TreeNode = { std: string; pas: [string, KbEntry[]][] };

export function MapKnowledgeView({
  entries, processAreas, standards,
}: { entries: KbEntry[]; processAreas: ProcessArea[]; standards: Standard[] }) {
  const [data, setData] = useState<KbEntry[]>(entries);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [stdSel, setStdSel] = useState("");
  const [paSel, setPaSel] = useState("");
  const [saving, setSaving] = useState(false);

  // Cascading PAs filtered by selected standard
  const filteredPas = useMemo(() => {
    if (!stdSel) return processAreas;
    return processAreas.filter(p => p.standardRef?.standard === stdSel || p.standardId === stdSel);
  }, [processAreas, stdSel]);

  // Flat list after search / unmapped filter
  const list = useMemo(() => {
    let items = data;
    if (search) {
      const t = search.toLowerCase();
      items = items.filter(e => e.knowledgeName.toLowerCase().includes(t));
    }
    if (onlyUnmapped) items = items.filter(e => !e.processAreaId);
    return items;
  }, [data, search, onlyUnmapped]);

  // Tree view: Standard → ProcessArea → entries (docs organized under mapped PA)
  const tree = useMemo<TreeNode[]>(() => {
    const stdMap = new Map<string, Map<string, KbEntry[]>>();
    for (const e of list) {
      const std = e.standardName || "No Standard";
      const pa = e.processAreaName || "Unmapped";
      if (!stdMap.has(std)) stdMap.set(std, new Map());
      const paMap = stdMap.get(std)!;
      if (!paMap.has(pa)) paMap.set(pa, []);
      paMap.get(pa)!.push(e);
    }
    const result: TreeNode[] = [];
    for (const [std, paMap] of [...stdMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      result.push({ std, pas: [...paMap.entries()].sort((a, b) => a[0].localeCompare(b[0])) });
    }
    return result;
  }, [list]);

  const selectedEntries = useMemo(
    () => data.filter(e => selectedIds.has(e.kID)),
    [data, selectedIds]
  );

  const prefillFor = (e: KbEntry) => {
    const pa = processAreas.find(p => p.id === e.processAreaId);
    setStdSel(pa?.standardRef?.standard ?? pa?.standardId ?? "");
    setPaSel(e.processAreaId ?? "");
  };

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
    if (next.size === 1) {
      const only = data.find(x => x.kID === [...next][0]);
      if (only) prefillFor(only);
    } else if (next.size === 0) {
      setStdSel("");
      setPaSel("");
    }
  };

  const selectAllVisible = () => setSelectedIds(new Set(list.map(e => e.kID)));
  const clearSelection = () => { setSelectedIds(new Set()); setStdSel(""); setPaSel(""); };

  // When standard changes, clear PA if it doesn't belong to the new standard
  const onStdChange = (v: string) => {
    setStdSel(v);
    if (!v) { setPaSel(""); return; }
    const pa = filteredPas.find(p => (p.standardRef?.standard === v || p.standardId === v) && p.id === paSel);
    if (!pa) setPaSel("");
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setSaving(true);
    try {
      const res = await fetch("/api/admin/table/Knowledgebase/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, processAreaId: paSel || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const pa = processAreas.find(p => p.id === paSel);
      setData(prev => prev.map(e =>
        ids.includes(e.kID)
          ? { ...e, processAreaId: paSel || null, processAreaName: pa?.name ?? null, standardName: pa?.standardRef?.standard ?? null }
          : e
      ));
      setSelectedIds(new Set());
      const n = ids.length;
      showToast(paSel ? `Mapped ${n} ${n === 1 ? "entry" : "entries"} to Process Area` : `Unmapped ${n} ${n === 1 ? "entry" : "entries"}`, "success");
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const mappedCount = data.filter(e => e.processAreaId).length;
  const unmappedCount = data.length - mappedCount;
  const totalInStd = (node: TreeNode) => node.pas.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="flex gap-0 h-[60vh]">
      {/* Entry tree with multi-select */}
      <div className="w-96 shrink-0 border-r border-slate-200 overflow-y-auto bg-slate-50">
        <div className="p-2 space-y-1.5 sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search knowledge…"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
              <input type="checkbox" checked={onlyUnmapped} onChange={e => setOnlyUnmapped(e.target.checked)} className="rounded" />
              Only unmapped ({unmappedCount})
            </label>
            <div className="flex gap-1.5">
              <button type="button" onClick={selectAllVisible}
                className="text-[10px] text-blue-600 hover:underline">Select all ({list.length})</button>
              <button type="button" onClick={clearSelection}
                className="text-[10px] text-slate-400 hover:underline">Clear</button>
            </div>
          </div>
        </div>
        <div className="p-2">
          {tree.map(node => (
            <CollapsibleSection key={`${node.std}-${onlyUnmapped}`} title={node.std} count={totalInStd(node)} defaultOpen={onlyUnmapped && node.std === "No Standard"}>
              <div className="space-y-1 pl-1 border-l border-slate-200 ml-1">
                {node.pas.map(([pa, items]) => (
                  <CollapsibleSection key={`${pa}-${onlyUnmapped}`} title={pa} count={items.length} defaultOpen={onlyUnmapped && node.std === "No Standard"}>
                    <div className="space-y-0.5 pl-1">
                      {items.map(e => (
                        <label key={e.kID}
                          className={`flex items-start gap-2 w-full text-left px-2 py-1.5 text-xs rounded cursor-pointer transition-colors ${
                            selectedIds.has(e.kID) ? "bg-blue-50" : "hover:bg-white"
                          }`}>
                          <input type="checkbox" checked={selectedIds.has(e.kID)} onChange={() => toggle(e.kID)} className="rounded mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate text-slate-700">{e.knowledgeName}</span>
                            <span className={`block text-[10px] ${e.processAreaId ? "text-slate-400" : "text-amber-600 font-semibold"}`}>
                              {e.standardName || "No Standard"} › {e.processAreaName || "Unmapped"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </CollapsibleSection>
                ))}
              </div>
            </CollapsibleSection>
          ))}
          {list.length === 0 && <p className="p-4 text-xs text-slate-400 text-center">No entries found.</p>}
        </div>
      </div>

      {/* Mapping panel */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedEntries.length > 0 ? (
          <div className="max-w-lg">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {selectedEntries.length === 1 ? selectedEntries[0].knowledgeName : `${selectedEntries.length} knowledge entries selected`}
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              {selectedEntries.length === 1
                ? `Currently: ${selectedEntries[0].standardName || "No Standard"} › ${selectedEntries[0].processAreaName || "Unmapped"}`
                : "Mapping will apply to all selected entries."}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Standard</label>
                <select value={stdSel} onChange={e => onStdChange(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                  <option value="">— None —</option>
                  {standards.map(s => <option key={s.id} value={s.standard}>{s.standard}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Process Area</label>
                <select value={paSel} onChange={e => setPaSel(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                  <option value="">— None (unmapped) —</option>
                  {filteredPas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 items-center">
                <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
                  {saving ? "Saving…" : selectedEntries.length > 1 ? `Map ${selectedEntries.length} Entries` : "Save Mapping"}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear Selection
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-16">
            Select one or more knowledge entries (checkboxes) to map them to a Standard → Process Area.
          </p>
        )}
      </div>
    </div>
  );
}
