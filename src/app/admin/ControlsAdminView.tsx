"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { showToast } from "@/components/Toast";

type Control = {
  id: string; name: string; statement: string; controlType: string;
  processAreaId: string; processArea?: { name: string; standardRef?: { standard: string } | null } | null;
  companyId?: string | null; knowledge?: string | null;
};

type ProcessArea = { id: string; name: string };

export function ControlsAdminView({ initialControls, initialProcessAreas, isAdmin }: { initialControls: Control[]; initialProcessAreas: ProcessArea[]; isAdmin?: boolean }) {
  const [controls, setControls] = useState<Control[]>(initialControls);
  const [pas] = useState<ProcessArea[]>(initialProcessAreas);
  const [editing, setEditing] = useState<Control | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", statement: "", controlType: "Administrative", processAreaId: "", companyId: "", knowledge: "" });
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return controls;
    const t = search.toLowerCase();
    return controls.filter(c => c.name.toLowerCase().includes(t) || (c.processArea?.name ?? "").toLowerCase().includes(t) || c.controlType.toLowerCase().includes(t));
  }, [controls, search]);

  // Group by Standard → PA
  const grouped = useMemo(() => {
    const byStd = new Map<string, Map<string, Control[]>>();
    for (const c of filtered) {
      const stdName = c.processArea?.standardRef?.standard ?? "No Standard";
      const paName = c.processArea?.name ?? "No PA";
      if (!byStd.has(stdName)) byStd.set(stdName, new Map());
      const byPA = byStd.get(stdName)!;
      if (!byPA.has(paName)) byPA.set(paName, []);
      byPA.get(paName)!.push(c);
    }
    return [...byStd.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const openEdit = (c: Control) => { setEditing(c); setForm({ name: c.name, statement: c.statement ?? "", controlType: c.controlType, processAreaId: c.processAreaId ?? "", companyId: c.companyId ?? "", knowledge: c.knowledge ?? "" }); };
  const openAdd = () => { setAdding(true); setForm({ name: "", statement: "", controlType: "Administrative", processAreaId: "", companyId: "", knowledge: "" }); };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/admin/controls/${editing.id}` : "/api/admin/controls";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (editing) setControls(prev => prev.map(c => c.id === editing.id ? data.control : c));
      else setControls(prev => [...prev, data.control]);
      showToast(editing ? "Updated" : "Created", "success"); setEditing(null); setAdding(false);
    } catch { showToast("Failed to save", "error"); } finally { setSaving(false); }
  };

  const controlTypes = ["Administrative", "Procedural", "Analytical", "Behavioral", "Informational", "Engineering"];

  const closeModal = useCallback(() => { setEditing(null); setAdding(false); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <input type="text" placeholder="Search controls by name, PA, or type…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm" />
        <span className="text-xs text-slate-400 shrink-0">{filtered.length} of {controls.length}</span>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add</Button>
      </div>

      <div className="space-y-2 max-h-[65vh] overflow-y-auto">
        {grouped.map(([stdName, paMap]) => (
          <CollapsibleSection key={stdName} title={stdName} count={[...paMap.values()].flat().length} defaultOpen={false}>
            <div className="space-y-1">
              {[...paMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([paName, ctrls]) => (
                <CollapsibleSection key={paName} title={paName} count={ctrls.length} defaultOpen={false}>
                  <div className="space-y-1">
                    {ctrls.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-1.5 px-3 rounded hover:bg-slate-50 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-slate-800">{c.name}</span>
                          <span className="ml-2 text-xs bg-slate-100 px-1.5 py-0.5 rounded">{c.controlType}</span>
                        </div>
                        <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:text-blue-800 shrink-0 ml-2">Edit</button>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              ))}
            </div>
          </CollapsibleSection>
        ))}
        {grouped.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No controls found.</p>}
      </div>

      <Modal isOpen={!!(editing || adding)} onClose={closeModal} title={editing ? "Edit Control" : "Add Control"}>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div><label className="text-xs font-medium text-slate-600">Name</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" /></div>
          <div><label className="text-xs font-medium text-slate-600">Statement</label><textarea value={form.statement} onChange={e => setForm({ ...form, statement: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={3} /></div>
          <div><label className="text-xs font-medium text-slate-600">Control Type</label><select value={form.controlType} onChange={e => setForm({ ...form, controlType: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">{controlTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="text-xs font-medium text-slate-600">Process Area</label><select value={form.processAreaId} onChange={e => setForm({ ...form, processAreaId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1"><option value="">— None —</option>{pas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="text-xs font-medium text-slate-600">Company ID</label><input type="text" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" placeholder="comp_…" /></div>
          {isAdmin && <div><label className="text-xs font-medium text-slate-600">🔒 Knowledge (Admin only)</label><textarea value={form.knowledge} onChange={e => setForm({ ...form, knowledge: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={4} placeholder="Audit knowledge, briefing notes, or control background…" /></div>}
          <div className="flex gap-2 mt-4 justify-end"><Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button><Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
