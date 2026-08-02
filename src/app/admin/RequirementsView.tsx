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
  controls: { mappingId: string; id: string; name: string; controlType: string }[];
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
  const [data, setData] = useState(() => {
    // Numeric clause sort — handles EMS-6.1.2, QMS-7.1.5, PMS-5.1.a, "11.2.1.1 - 11.2.1.2", "6.1 & 6.2"
    const parseClause = (id: string) => {
      // Strip prefix like "EMS-", "QMS-", "OHSMS-", "PMS-"
      let num = id.replace(/^[A-Za-z]+-/, "");
      // Take only the first clause part (before " & ", " - ", or space)
      num = num.split(/[&\- ]/)[0].trim();
      // Parse segments: split by ".", convert to numbers where possible
      return num.split(".").map(s => { const n = Number(s); return isNaN(n) ? s : n; });
    };
    const cmp = (a: any, b: any): number => {
      if (typeof a === "number" && typeof b === "number") return a - b;
      if (typeof a === "number") return -1;
      if (typeof b === "number") return 1;
      return String(a).localeCompare(String(b));
    };
    return [...requirements].sort((a, b) => {
      const va = parseClause(a.requirementId), vb = parseClause(b.requirementId);
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const r = cmp(va[i] ?? 0, vb[i] ?? 0);
        if (r !== 0) return r;
      }
      return 0;
    });
  });

  // ── Control mapping modal state ──
  const [mappingTarget, setMappingTarget] = useState<{ rId: number; requirementId: string } | null>(null);
  const [controlSearch, setControlSearch] = useState("");
  const [paFilter, setPaFilter] = useState("");
  const [availableControls, setAvailableControls] = useState<any[]>([]);
  const [loadingControls, setLoadingControls] = useState(false);
  const [linking, setLinking] = useState(false);
  const [showNewControlForm, setShowNewControlForm] = useState(false);
  const [newControl, setNewControl] = useState({ name: "", controlType: "Procedural", statement: "", controlRef: "", processAreaId: "" });
  const [creatingControl, setCreatingControl] = useState(false);

  // Derive unique PAs from available controls
  const paList = useMemo(() => {
    const pas = new Map<string, string>();
    for (const c of availableControls) {
      if (c.processAreaId && !pas.has(c.processAreaId)) {
        pas.set(c.processAreaId, c.processAreaName || c.processAreaId);
      }
    }
    return [...pas.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [availableControls]);

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

  // ── Control mapping helpers ──
  const openMappingModal = async (r: ReqData) => {
    setMappingTarget({ rId: r.rId, requirementId: r.requirementId });
    setControlSearch("");
    setPaFilter("");
    setShowNewControlForm(false);
    setNewControl({ name: "", controlType: "Procedural", statement: "", controlRef: "", processAreaId: "" });
    setLoadingControls(true);
    try {
      const res = await fetch("/api/admin/controls");
      if (res.ok) {
        const json = await res.json();
        setAvailableControls(json.controls || []);
      }
    } catch { /* ignore */ }
    finally { setLoadingControls(false); }
  };

  const handleLinkControl = async (controlId: string) => {
    if (!mappingTarget) return;
    setLinking(true);
    try {
      const res = await fetch("/api/admin/table/MapControl2Requirement/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId, requirementRId: mappingTarget.rId }),
      });
      if (!res.ok) throw new Error("Link failed");
      const json = await res.json();
      // Add to local state
      const ctrl = availableControls.find((c: any) => c.id === controlId);
      setData((prev) => prev.map((r) => r.rId === mappingTarget.rId
        ? { ...r, controls: [...r.controls, { mappingId: json.id, id: controlId, name: ctrl?.name || controlId, controlType: ctrl?.controlType || "" }] }
        : r
      ));
      setMsg({ type: "ok", text: `Linked ${ctrl?.name || controlId}.` });
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Link failed" });
    }
    finally { setLinking(false); }
  };

  const handleUnlinkControl = async (mappingId: string, controlName: string, rId: number) => {
    try {
      const res = await fetch(`/api/admin/table/MapControl2Requirement/${mappingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Unlink failed");
      setData((prev) => prev.map((r) => r.rId === rId
        ? { ...r, controls: r.controls.filter((c) => c.mappingId !== mappingId) }
        : r
      ));
      setMsg({ type: "ok", text: `Removed ${controlName}.` });
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Unlink failed" });
    }
  };

  const handleCreateControl = async () => {
    if (!mappingTarget || !newControl.name.trim() || !newControl.processAreaId) return;
    setCreatingControl(true);
    try {
      // 1. Create the control
      const createRes = await fetch("/api/admin/controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newControl.name.trim(),
          controlType: newControl.controlType,
          statement: newControl.statement.trim(),
          processAreaId: newControl.processAreaId,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create control");
      const { control: created } = await createRes.json();

      // 2. Link it to the requirement
      const linkRes = await fetch("/api/admin/table/MapControl2Requirement/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId: created.id, requirementRId: mappingTarget.rId }),
      });
      if (!linkRes.ok) throw new Error("Control created but link failed");
      const linkJson = await linkRes.json();

      // 3. Update local state
      setData((prev) => prev.map((r) => r.rId === mappingTarget.rId
        ? { ...r, controls: [...r.controls, { mappingId: linkJson.id, id: created.id, name: created.name, controlType: created.controlType }] }
        : r
      ));
      // 4. Add to available controls list so it shows immediately
      const paName = paList.find(([id]) => id === newControl.processAreaId)?.[1] || "";
      setAvailableControls((prev) => [...prev, {
        id: created.id, name: created.name, controlType: created.controlType,
        controlRef: "", processAreaId: newControl.processAreaId, processAreaName: paName,
        mappedRequirementRIds: [mappingTarget.rId],
      }]);

      setMsg({ type: "ok", text: `Created & linked "${newControl.name.trim()}".` });
      setTimeout(() => setMsg(null), 2000);
      setShowNewControlForm(false);
      setNewControl({ name: "", controlType: "Procedural", statement: "", controlRef: "", processAreaId: "" });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Creation failed" });
    }
    finally { setCreatingControl(false); }
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
                                <div className="border-t border-slate-100 pt-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-medium text-slate-600">Associated Controls ({r.controls.length})</h4>
                                    <button onClick={() => openMappingModal(r)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">＋ Add Control</button>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {r.controls.map((c) => (
                                      <span key={c.mappingId} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 group">
                                        {c.name} <span className="text-slate-400">({c.controlType})</span>
                                        <button onClick={() => handleUnlinkControl(c.mappingId, c.name, r.rId)}
                                          className="ml-0.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                          title="Remove mapping">×</button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {r.controls.length === 0 && (
                                <div className="border-t border-slate-100 pt-3">
                                  <button onClick={() => openMappingModal(r)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">＋ Add Control</button>
                                </div>
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

      {/* ── Control Mapping Modal ── */}
      {mappingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMappingTarget(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">🔗 Map Controls to Requirement</h3>
                <p className="text-xs text-slate-500 mt-0.5">{mappingTarget.requirementId}</p>
              </div>
              <button onClick={() => setMappingTarget(null)} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>

            {/* ProcessArea filter + search */}
            <div className="px-6 py-3 border-b border-slate-100 shrink-0 space-y-2">
              <select
                value={paFilter} onChange={e => setPaFilter(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">All Process Areas</option>
                {paList.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <input
                type="text" value={controlSearch} onChange={e => setControlSearch(e.target.value)}
                placeholder="Search controls by name…"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
            </div>

            {/* Control list */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {loadingControls ? (
                <p className="text-sm text-slate-400 py-4 text-center">Loading controls…</p>
              ) : showNewControlForm ? (
                /* ── New Control Form ── */
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-700">＋ Register New Control</h4>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Process Area *</label>
                    <select
                      value={newControl.processAreaId} onChange={e => setNewControl(p => ({ ...p, processAreaId: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Select Process Area…</option>
                      {paList.map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Control Name *</label>
                    <input type="text" value={newControl.name} onChange={e => setNewControl(p => ({ ...p, name: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="e.g., Calibrate Monitoring Equipment" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Control Type</label>
                      <select value={newControl.controlType} onChange={e => setNewControl(p => ({ ...p, controlType: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white">
                        <option>Procedural</option><option>Engineering</option><option>Administrative</option><option>Analytical</option><option>Informational</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Control Ref</label>
                      <input type="text" value={newControl.controlRef} onChange={e => setNewControl(p => ({ ...p, controlRef: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="e.g., QMS-001" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Statement</label>
                    <textarea value={newControl.statement} onChange={e => setNewControl(p => ({ ...p, statement: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[60px]" placeholder="What does this control require?" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleCreateControl}
                      disabled={creatingControl || !newControl.name.trim() || !newControl.processAreaId}
                      className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {creatingControl ? "Creating…" : "Create & Link"}
                    </button>
                    <button onClick={() => setShowNewControlForm(false)}
                      className="rounded bg-slate-100 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {availableControls
                    .filter((c: any) => {
                      if (paFilter && c.processAreaId !== paFilter) return false;
                      if (controlSearch && !c.name?.toLowerCase().includes(controlSearch.toLowerCase())) return false;
                      return true;
                    })
                    .slice(0, 50)
                    .map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => handleLinkControl(c.id)}
                        disabled={linking}
                        className="w-full text-left flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        <span className="text-blue-400 shrink-0">＋</span>
                        <span className="font-medium text-slate-700 truncate flex-1">{c.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{c.controlType}</span>
                        {c.processAreaName && (
                          <span className="text-xs text-slate-300 truncate max-w-[140px] shrink-0">{c.processAreaName}</span>
                        )}
                      </button>
                    ))}
                  {availableControls.length === 0 && !loadingControls && (
                    <p className="text-sm text-slate-400 py-4 text-center">No controls found. Add controls via the Controls admin tab first.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 shrink-0 flex justify-between items-center">
              <div className="flex gap-2">
                {!showNewControlForm && (
                  <button onClick={() => setShowNewControlForm(true)}
                    className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                    ＋ New Control
                  </button>
                )}
                <span className="text-xs text-slate-400 self-center">
                  {availableControls.filter((c: any) => {
                    if (paFilter && c.processAreaId !== paFilter) return false;
                    if (controlSearch && !c.name?.toLowerCase().includes(controlSearch.toLowerCase())) return false;
                    return true;
                  }).length} control(s) available
                </span>
              </div>
              <button onClick={() => setMappingTarget(null)}
                className="rounded bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
