"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { showToast } from "@/components/Toast";

type ProcessArea = {
  id: string;
  name: string;
  description?: string | null;
  standardId?: string | null;
  standardRef?: { standard: string } | null;
  companyId?: string | null;
};

type Standard = { id: string; standard: string };

export function ProcessAreasAdminView() {
  const router = useRouter();
  const [pas, setPas] = useState<ProcessArea[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProcessArea | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", standardId: "", companyId: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/table/ProcessArea/data").then(r => r.json()),
      fetch("/api/admin/table/Standard/data").then(r => r.json()),
    ]).then(([paData, stdData]) => {
      setPas(paData.rows ?? paData.data ?? []);
      setStandards(stdData.rows ?? stdData.data ?? []);
    }).catch(() => showToast("Failed to load data", "error"))
      .finally(() => setLoading(false));
  }, []);

  const openEdit = (pa: ProcessArea) => {
    setEditing(pa);
    setForm({ name: pa.name, description: pa.description ?? "", standardId: pa.standardId ?? "", companyId: pa.companyId ?? "" });
  };

  const openAdd = () => {
    setAdding(true);
    setForm({ name: "", description: "", standardId: "", companyId: "" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/table/ProcessArea/${editing.id}`
        : "/api/admin/table/ProcessArea/data";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? form : { ...form }),
      });
      if (!res.ok) throw new Error("Failed to save");
      showToast(editing ? "Updated" : "Created", "success");
      setEditing(null); setAdding(false);
      router.refresh();
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">{pas.length} Process Areas</h3>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add Process Area</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Standard</th>
              <th className="py-2 px-3 font-medium">Company</th>
              <th className="py-2 px-3 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {pas.map(pa => (
              <tr key={pa.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-3 font-medium text-slate-800">{pa.name}</td>
                <td className="py-2 px-3 text-slate-500">{pa.standardRef?.standard ?? "—"}</td>
                <td className="py-2 px-3 text-slate-400 text-xs">{pa.companyId ?? "—"}</td>
                <td className="py-2 px-3">
                  <button onClick={() => openEdit(pa)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit/Add Modal */}
      <Modal isOpen={!!(editing || adding)} onClose={() => { setEditing(null); setAdding(false); }} title={editing ? "Edit Process Area" : "Add Process Area"}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Name</label>
              <input type="text" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <input type="text" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Standard</label>
              <select value={form.standardId}
                onChange={e => setForm({ ...form, standardId: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                <option value="">— None —</option>
                {standards.map(s => <option key={s.id} value={s.id}>{s.standard}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Company ID</label>
              <input type="text" value={form.companyId}
                onChange={e => setForm({ ...form, companyId: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" placeholder="comp_..." />
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
