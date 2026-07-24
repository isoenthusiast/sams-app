"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { showToast } from "@/components/Toast";

type Company = {
  id: string;
  companyID: string;
  companyName: string;
  shortName?: string | null;
  referenceID?: string | null;
};

export function CompanyAdminView() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ companyID: "", companyName: "", shortName: "", referenceID: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/table/Company/data")
      .then(r => r.json())
      .then(data => setCompanies(data.rows ?? data.data ?? []))
      .catch(() => showToast("Failed to load", "error"))
      .finally(() => setLoading(false));
  }, []);

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({ companyID: c.companyID, companyName: c.companyName, shortName: c.shortName ?? "", referenceID: c.referenceID ?? "" });
  };

  const openAdd = () => {
    setAdding(true);
    setForm({ companyID: "", companyName: "", shortName: "", referenceID: "" });
  };

  const handleSave = async () => {
    if (!form.companyID.trim() || !form.companyName.trim()) { showToast("Company ID and Name are required", "error"); return; }
    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/table/Company/${editing.id}`
        : "/api/admin/table/Company/data";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed");
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
        <h3 className="text-sm font-medium text-slate-700">{companies.length} Companies</h3>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add Company</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map(c => (
          <Card key={c.id} padding="sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-800">{c.companyName}</div>
                <div className="text-xs text-slate-400 mt-0.5">ID: {c.companyID}</div>
                {c.shortName && <div className="text-xs text-slate-500">Short: {c.shortName}</div>}
                {c.referenceID && <div className="text-xs text-slate-400">Ref: {c.referenceID}</div>}
              </div>
              <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:text-blue-800 shrink-0">Edit</button>
            </div>
          </Card>
        ))}
        {companies.length === 0 && <p className="text-sm text-slate-400 col-span-full py-8 text-center">No companies found.</p>}
      </div>

      <Modal isOpen={!!(editing || adding)} onClose={() => { setEditing(null); setAdding(false); }} title={editing ? "Edit Company" : "Add Company"}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Company ID <span className="text-red-400">*</span></label>
              <input type="text" value={form.companyID} onChange={e => setForm({ ...form, companyID: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" placeholder="comp_xxx" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Company Name <span className="text-red-400">*</span></label>
              <input type="text" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Short Name</label>
              <input type="text" value={form.shortName} onChange={e => setForm({ ...form, shortName: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Reference ID</label>
              <input type="text" value={form.referenceID} onChange={e => setForm({ ...form, referenceID: e.target.value })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
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
