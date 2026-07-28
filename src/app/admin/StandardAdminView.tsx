"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

type Standard = { id: string; standard: string; standardDescription?: string | null; sequenceNo: number; companyId?: string | null };

export function StandardAdminView({ initialStandards }: { initialStandards: Standard[] }) {
  const [standards, setStandards] = useState<Standard[]>(initialStandards);
  const [editing, setEditing] = useState<Standard | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ standard: "", standardDescription: "", sequenceNo: 0 });
  const [saving, setSaving] = useState(false);

  const openEdit = (s: Standard) => {
    setEditing(s);
    setForm({ standard: s.standard, standardDescription: s.standardDescription ?? "", sequenceNo: s.sequenceNo });
  };

  const openAdd = () => { setAdding(true); setForm({ standard: "", standardDescription: "", sequenceNo: 0 }); };

  const handleSave = async () => {
    if (!form.standard.trim()) { showToast("Standard name is required", "error"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/admin/standards/${editing.id}` : "/api/admin/standards";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (editing) setStandards(prev => prev.map(s => s.id === editing.id ? data.standard : s));
      else setStandards(prev => [...prev, data.standard]);
      showToast(editing ? "Updated" : "Created", "success");
      setEditing(null); setAdding(false);
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (s: Standard) => {
    if (!confirm(`Delete standard "${s.standard}"?`)) return;
    try {
      await fetch(`/api/admin/standards/${s.id}`, { method: "DELETE" });
      setStandards(prev => prev.filter(x => x.id !== s.id));
      showToast("Deleted", "success");
    } catch { showToast("Failed to delete", "error"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">{standards.length} Standards</h3>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add Standard</Button>
      </div>

      {(editing || adding) && (
        <div className="mb-4 p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500">Standard Name *</label>
              <input type="text" value={form.standard} onChange={e => setForm({ ...form, standard: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Description</label>
              <input type="text" value={form.standardDescription} onChange={e => setForm({ ...form, standardDescription: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Sequence</label>
              <input type="number" value={form.sequenceNo} onChange={e => setForm({ ...form, sequenceNo: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-0.5" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : editing ? "Update" : "Create"}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</Button>
          </div>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
            <th className="py-2 pr-4">Standard</th>
            <th className="py-2 pr-4 hidden sm:table-cell">Description</th>
            <th className="py-2 pr-4 w-16">Seq</th>
            <th className="py-2 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {standards.map(s => (
            <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="py-2 pr-4 font-medium text-slate-800">{s.standard}</td>
              <td className="py-2 pr-4 text-slate-500 hidden sm:table-cell">{s.standardDescription || "—"}</td>
              <td className="py-2 pr-4 text-slate-400">{s.sequenceNo}</td>
              <td className="py-2">
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                  <button onClick={() => handleDelete(s)} className="text-xs text-red-500 hover:text-red-700">Del</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {standards.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No standards found.</p>}
    </div>
  );
}
