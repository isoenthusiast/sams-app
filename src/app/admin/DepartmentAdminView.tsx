"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

type Dept = { id: string; name: string; companyId: string };

export function DepartmentAdminView({ initialDepartments }: { initialDepartments: Dept[] }) {
  const [departments, setDepartments] = useState<Dept[]>(initialDepartments);
  const [form, setForm] = useState({ name: "" });
  const [editing, setEditing] = useState<Dept | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Department name is required", "error"); return; }
    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/departments/${editing.id}`
        : "/api/admin/departments";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim() }) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (editing) {
        setDepartments(prev => prev.map(d => d.id === editing.id ? data.department : d));
      } else {
        setDepartments(prev => [...prev, data.department]);
      }
      showToast(editing ? "Updated" : "Created", "success");
      setEditing(null); setForm({ name: "" });
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (d: Dept) => {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    try {
      await fetch(`/api/admin/departments/${d.id}`, { method: "DELETE" });
      setDepartments(prev => prev.filter(x => x.id !== d.id));
      showToast("Deleted", "success");
    } catch { showToast("Failed to delete", "error"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">{departments.length} Departments</h3>
        <Button variant="primary" size="sm" onClick={() => { setEditing(null); setForm({ name: "" }); }}>
          + Add Department
        </Button>
      </div>

      {/* Add/Edit form */}
      {(editing || (!editing && form.name !== "")) && (
        <div className="mb-4 flex gap-2">
          <input type="text" value={form.name} onChange={e => setForm({ name: e.target.value })}
            placeholder="Department name"
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : editing ? "Update" : "Add"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setForm({ name: "" }); }}>Cancel</Button>
        </div>
      )}

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {departments.map(d => (
          <div key={d.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 hover:bg-slate-50">
            <span className="text-sm text-slate-700">{d.name}</span>
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => { setEditing(d); setForm({ name: d.name }); }}
                className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
              <button onClick={() => handleDelete(d)}
                className="text-xs text-red-500 hover:text-red-700">Del</button>
            </div>
          </div>
        ))}
        {departments.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No departments found.</p>}
      </div>
    </div>
  );
}
