"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

type Doc = {
  id: string; documentNo?: string; filename: string; summary?: string | null;
  processAreaId?: string | null; companyId?: string | null;
  createdAt: string; documentContent?: string;
};

export function DocumentsAdminView({
  companies, standards, processAreas,
}: {
  companies: any[]; standards: any[]; processAreas: any[];
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState("");
  const [filterStandard, setFilterStandard] = useState("");
  const [filterPA, setFilterPA] = useState("");
  const [selected, setSelected] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPaId, setUploadPaId] = useState("");
  const [uploadCompanyId, setUploadCompanyId] = useState("");

  const fetchDocs = () => {
    setLoading(true);
    fetch("/api/admin/documents")
      .then(r => r.json())
      .then(data => setDocs(data.documents ?? data.data ?? []))
      .catch(() => showToast("Failed to load documents", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocs(); }, []);

  const filtered = docs.filter(d => {
    if (filterCompany && d.companyId !== filterCompany) return false;
    if (filterPA && d.processAreaId !== filterPA) return false;
    return true;
  });

  const handleUpload = async () => {
    if (!file) { showToast("Select a file", "error"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (uploadPaId) formData.append("processAreaId", uploadPaId);
      if (uploadCompanyId) formData.append("companyId", uploadCompanyId);
      formData.append("folder", "Uploaded");

      const res = await fetch("/api/chat/knowledge/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      showToast("Document uploaded", "success");
      setFile(null); setUploadPaId(""); setUploadCompanyId("");
      fetchDocs();
    } catch { showToast("Upload failed", "error"); }
    finally { setUploading(false); }
  };

  const handleDelete = async (doc: Doc) => {
    if (!confirm(`Archive document "${doc.filename}"?`)) return;
    try {
      await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      showToast("Document archived", "success");
    } catch { showToast("Failed to archive", "error"); }
  };

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;

  return (
    <div>
      {/* Filters + Upload */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label className="text-[10px] text-slate-400 block">Company</label>
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs bg-white">
            <option value="">All</option>
            {companies.map((c: any) => <option key={c.id} value={c.id}>{c.companyID}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-400 block">Standard</label>
          <select value={filterStandard} onChange={e => setFilterStandard(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs bg-white">
            <option value="">All</option>
            {standards.map((s: any) => <option key={s.id} value={s.id}>{s.standard}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-400 block">Process Area</label>
          <select value={filterPA} onChange={e => setFilterPA(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs bg-white max-w-[200px]">
            <option value="">All</option>
            {processAreas.map((pa: any) => <option key={pa.id} value={pa.id}>{pa.name}</option>)}
          </select>
        </div>
        <div className="flex-1"></div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[10px] text-slate-400 block">+ Add Document</label>
            <div className="flex gap-1">
              <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
                className="rounded border border-slate-300 px-2 py-1 text-xs w-40" />
              <select value={uploadPaId} onChange={e => setUploadPaId(e.target.value)}
                className="rounded border border-slate-300 px-1 py-1 text-[10px] bg-white w-32">
                <option value="">PA (opt)</option>
                {processAreas.map((pa: any) => <option key={pa.id} value={pa.id}>{pa.name}</option>)}
              </select>
              <select value={uploadCompanyId} onChange={e => setUploadCompanyId(e.target.value)}
                className="rounded border border-slate-300 px-1 py-1 text-[10px] bg-white w-20">
                <option value="">Co (opt)</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.companyID}</option>)}
              </select>
              <Button variant="primary" size="sm" disabled={uploading || !file} onClick={handleUpload}>
                {uploading ? "..." : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Document list */}
      <div className="space-y-1 max-h-[55vh] overflow-y-auto">
        {filtered.map(d => (
          <div key={d.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 hover:bg-slate-50 text-sm">
            <div className="flex-1 min-w-0">
              <button onClick={() => setSelected(selected?.id === d.id ? null : d)}
                className="text-left text-slate-700 hover:text-blue-600 truncate block w-full">
                📄 {d.filename}
              </button>
              {selected?.id === d.id && d.documentContent && (
                <div className="mt-2 p-3 bg-slate-50 rounded text-xs text-slate-600 max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {d.documentContent.slice(0, 2000)}
                  {d.documentContent.length > 2000 && <p className="text-slate-400 mt-1">... truncated</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-[10px] text-slate-400">{companies.find((c: any) => c.id === d.companyId)?.companyID || "—"}</span>
              <button onClick={() => handleDelete(d)} className="text-[10px] text-red-400 hover:text-red-600">🗑</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No documents found.</p>}
      </div>
    </div>
  );
}
