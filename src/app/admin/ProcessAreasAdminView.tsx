"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { showToast } from "@/components/Toast";

type ProcessArea = {
  id: string; name: string; description?: string | null;
  standardId?: string | null; standardRef?: { standard: string } | null; companyId?: string | null;
};
type Standard = { id: string; standard: string };

export function ProcessAreasAdminView({ initialProcessAreas, initialStandards }: { initialProcessAreas: ProcessArea[]; initialStandards: Standard[] }) {
  const [pas, setPas] = useState<ProcessArea[]>(initialProcessAreas);
  const [standards] = useState<Standard[]>(initialStandards);
  const [editing, setEditing] = useState<ProcessArea | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", standardId: "", companyId: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<string, ProcessArea[]>();
    for (const pa of pas) {
      if (search && !pa.name.toLowerCase().includes(search.toLowerCase())) continue;
      const stdName = pa.standardRef?.standard ?? "No Standard";
      if (!map.has(stdName)) map.set(stdName, []);
      map.get(stdName)!.push(pa);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pas, search]);
  const filteredCount = useMemo(() => pas.filter(pa => !search || pa.name.toLowerCase().includes(search.toLowerCase())).length, [pas, search]);

  const openEdit = (pa: ProcessArea) => { setEditing(pa); setForm({ name: pa.name, description: pa.description ?? "", standardId: pa.standardId ?? "", companyId: pa.companyId ?? "" }); };
  const openAdd = () => { setAdding(true); setForm({ name: "", description: "", standardId: "", companyId: "" }); };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/admin/processareas/${editing.id}` : "/api/admin/processareas";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      if (editing) setPas(prev => prev.map(p => p.id === editing.id ? data.processArea : p));
      else setPas(prev => [...prev, data.processArea]);
      showToast(editing ? "Updated" : "Created", "success"); setEditing(null); setAdding(false);
    } catch { showToast("Failed to save", "error"); } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <input type="text" placeholder="Search process areas…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm" />
        <span className="text-xs text-slate-400 shrink-0">{filteredCount} of {pas.length}</span>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add</Button>
      </div>
      <div className="space-y-2 max-h-[65vh] overflow-y-auto">
        {grouped.map(([stdName, items]) => (
          <CollapsibleSection key={stdName} title={stdName} count={items.length} defaultOpen={false}>
            <div className="space-y-1">
              {items.map(pa => (
                <div key={pa.id} className="flex items-center justify-between py-1.5 px-3 rounded hover:bg-slate-50 text-sm">
                  <div><span className="font-medium text-slate-800">{pa.name}</span>
                    {pa.description && <span className="text-xs text-slate-400 ml-2">— {pa.description}</span>}</div>
                  <button onClick={() => openEdit(pa)} className="text-xs text-blue-600 hover:text-blue-800 shrink-0">Edit</button>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        ))}
        {grouped.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No process areas found.</p>}
      </div>
      <Modal isOpen={!!(editing || adding)} onClose={() => { setEditing(null); setAdding(false); }} title={editing ? "Edit Process Area" : "Add Process Area"}>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-slate-600">Name</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" /></div>
          <div><label className="text-xs font-medium text-slate-600">Description</label><input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" /></div>
          <div><label className="text-xs font-medium text-slate-600">Standard</label><select value={form.standardId} onChange={e => setForm({ ...form, standardId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1"><option value="">— None —</option>{standards.map(s => <option key={s.id} value={s.id}>{s.standard}</option>)}</select></div>
          <div><label className="text-xs font-medium text-slate-600">Company ID</label><input type="text" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" placeholder="comp_..." /></div>
          <div className="flex gap-2 mt-4 justify-end"><Button variant="ghost" size="sm" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</Button><Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
