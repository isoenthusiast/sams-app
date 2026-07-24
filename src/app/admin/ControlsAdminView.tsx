"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { showToast } from "@/components/Toast";

type Control = {
  id: string;
  name: string;
  statement: string;
  controlType: string;
  processAreaId: string;
  processArea?: { name: string } | null;
  companyId?: string | null;
  standard?: string | null;
};

type ProcessArea = { id: string; name: string };

export function ControlsAdminView() {
  const router = useRouter();
  const [controls, setControls] = useState<Control[]>([]);
  const [pas, setPas] = useState<ProcessArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Control | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", statement: "", controlType: "Administrative", processAreaId: "", companyId: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/table/Control/data").then(r => r.json()),
      fetch("/api/admin/table/ProcessArea/data").then(r => r.json()),
    ]).then(([ctrlData, paData]) => {
      setControls(ctrlData.rows ?? ctrlData.data ?? []);
      setPas(paData.rows ?? paData.data ?? []);
    }).catch(() => showToast("Failed to load", "error"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return controls;
    const t = search.toLowerCase();
    return controls.filter(c => c.name.toLowerCase().includes(t) || (c.processArea?.name ?? "").toLowerCase().includes(t) || c.controlType.toLowerCase().includes(t));
  }, [controls, search]);

  const openEdit = (c: Control) => {
    setEditing(c);
    setForm({ name: c.name, statement: c.statement ?? "", controlType: c.controlType, processAreaId: c.processAreaId ?? "", companyId: c.companyId ?? "" });
  };

  const openAdd = () => {
    setAdding(true);
    setForm({ name: "", statement: "", controlType: "Administrative", processAreaId: "", companyId: "" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/table/Control/${editing.id}`
        : "/api/admin/table/Control/data";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed");
      showToast(editing ? "Updated" : "Created", "success");
      setEditing(null); setAdding(false);
      router.refresh();
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const controlTypes = ["Administrative", "Procedural", "Analytical", "Behavioral", "Informational", "Engineering"];

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <input type="text" placeholder="Search controls…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm" />
        <span className="text-xs text-slate-400 shrink-0">{filtered.length} of {controls.length}</span>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add Control</Button>
      </div>

      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Process Area</th>
              <th className="py-2 px-3 font-medium">Type</th>
              <th className="py-2 px-3 font-medium">Company</th>
              <th className="py-2 px-3 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-3 font-medium text-slate-800 max-w-[300px] truncate">{c.name}</td>
                <td className="py-2 px-3 text-slate-500 text-xs">{c.processArea?.name ?? "—"}</td>
                <td className="py-2 px-3"><span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{c.controlType}</span></td>
                <td className="py-2 px-3 text-slate-400 text-xs">{c.companyId ?? "—"}</td>
                <td className="py-2 px-3">
                  <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No controls found.</p>}
      </div>

      <Modal isOpen={!!(editing || adding)} onClose={() => { setEditing(null); setAdding(false); }} title={editing ? "Edit Control" : "Add Control"}>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="text-xs font-medium text-slate-600">Name</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Statement</label>
              <textarea value={form.statement} onChange={e => setForm({ ...form, statement: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={3} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Control Type</label>
              <select value={form.controlType} onChange={e => setForm({ ...form, controlType: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                {controlTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Process Area</label>
              <select value={form.processAreaId} onChange={e => setForm({ ...form, processAreaId: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                <option value="">— None —</option>
                {pas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Company ID</label>
              <input type="text" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" placeholder="comp_…" />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
      </Modal>
    </div>
  );
}
