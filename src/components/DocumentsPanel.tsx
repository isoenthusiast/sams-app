"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

export type PaDocument = {
  id: string;
  filename: string;
  summary: string | null;
  source: string | null;
  folder: string | null;
  companyId: string | null;
  processAreaId: string | null;
  createdAt: string;
  documentContent: string;
};

type Props = {
  documents: PaDocument[];
  processAreaId: string;
  companyId: string | null;
  masterCompanyId: string;
  currentUserRole: string | null;
};

export default function DocumentsPanel({ documents, processAreaId, companyId, masterCompanyId, currentUserRole }: Props) {
  const router = useRouter();
  const isAdmin = currentUserRole === "Admin";
  const canUpload = currentUserRole !== "Interviewee";
  const isMasterSelected = (companyId ?? masterCompanyId) === masterCompanyId;

  const sharedDocs = documents.filter((d) => d.companyId === masterCompanyId);
  const companyDocs = documents.filter((d) => d.companyId !== masterCompanyId);

  const [sharedOpen, setSharedOpen] = useState(true);
  const [companyOpen, setCompanyOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadShared, setUploadShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("processAreaId", processAreaId);
        fd.append("companyId", uploadShared && isMasterSelected ? masterCompanyId : (companyId ?? masterCompanyId));
        fd.append("folder", "Uploaded");
        const res = await fetch("/api/chat/knowledge/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(await res.text().catch(() => "upload failed"));
        ok++;
      } catch {
        fail++;
      }
    }
    setUploading(false);
    if (ok > 0) showToast(`${ok} document${ok > 1 ? "s" : ""} uploaded`, "success");
    if (fail > 0) showToast(`${fail} upload${fail > 1 ? "s" : ""} failed`, "error");
    router.refresh();
  };

  const handleSaveSummary = async (docId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summaryDraft }),
      });
      if (!res.ok) throw new Error("Failed to save summary");
      setEditingSummaryId(null);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: PaDocument) => {
    if (!confirm(`Archive "${doc.filename}"? It will no longer appear here or feed the AI.`)) return;
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to archive");
      }
      showToast("Document archived", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to archive", "error");
    }
  };

  const renderDoc = (doc: PaDocument, isShared: boolean) => {
    const expanded = expandedId === doc.id;
    const editingSummary = editingSummaryId === doc.id;
    const canDelete = isAdmin && (!isShared || isMasterSelected);
    return (
      <div key={doc.id} className="border border-slate-200 rounded-md p-3 bg-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setExpandedId(expanded ? null : doc.id)}
              className="text-sm font-medium text-slate-800 hover:text-blue-700 text-left truncate w-full"
              title={doc.filename}
            >
              {expanded ? "▼" : "▶"} 📄 {doc.filename}
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${isShared ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                {isShared ? "🌐 Shared (SAMS001)" : "🏢 Company"}
              </span>
              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {doc.folder === "AI Chat" ? "💬 AI Chat" : "📤 Uploaded"}
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(doc.createdAt).toLocaleDateString()}
              </span>
              <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700" title="The AI assistant in the Knowledgebase tab can read this document">
                🤖 AI-readable
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canUpload && !editingSummary && (
              <button
                onClick={() => { setEditingSummaryId(doc.id); setSummaryDraft(doc.summary ?? ""); }}
                className="text-xs text-slate-500 hover:text-blue-600 px-1.5 py-1"
                title="Edit summary"
              >
                ✏️
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(doc)}
                className="text-xs text-slate-400 hover:text-red-600 px-1.5 py-1"
                title="Archive document"
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        {editingSummary ? (
          <div className="mt-2">
            <textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              rows={2}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              placeholder="Short summary shown in lists and to the AI…"
            />
            <div className="mt-1 flex gap-2">
              <Button variant="primary" size="sm" disabled={saving} onClick={() => handleSaveSummary(doc.id)}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingSummaryId(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          doc.summary && <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{doc.summary}</p>
        )}

        {/* Expandable content */}
        {expanded && (
          <div className="mt-3 max-h-80 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-3">
            <pre className="whitespace-pre-wrap text-xs text-slate-700 font-sans">{doc.documentContent}</pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Upload card */}
      {canUpload && (
        <Card title="Upload Documents" padding="sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              {uploading ? "Uploading…" : "📎 Choose files"}
              <input
                type="file"
                multiple
                disabled={uploading}
                accept=".pdf,.md,.csv,.txt,.docx,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
              />
            </label>
            {isMasterSelected && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uploadShared}
                  onChange={(e) => setUploadShared(e.target.checked)}
                  className="rounded"
                />
                🌐 Shared with all companies
              </label>
            )}
            <span className="text-xs text-slate-400">
              PDF, DOCX, MD, CSV, TXT, images · tagged to this process area · readable by the AI assistant
            </span>
          </div>
        </Card>
      )}

      {/* Shared section */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setSharedOpen(!sharedOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
        >
          <span className="text-sm font-semibold text-blue-900">🌐 Shared Documents (SAMS001)</span>
          <span className="text-xs text-blue-600">{sharedOpen ? "▼" : "▶"} {sharedDocs.length}</span>
        </button>
        {sharedOpen && (
          <div className="p-3 space-y-2 bg-blue-50/30">
            {sharedDocs.length === 0
              ? <p className="text-xs text-slate-400 py-2">No shared documents for this process area yet.</p>
              : sharedDocs.map((d) => renderDoc(d, true))}
          </div>
        )}
      </div>

      {/* Company section */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setCompanyOpen(!companyOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 transition-colors text-left"
        >
          <span className="text-sm font-semibold text-emerald-900">🏢 Company Documents</span>
          <span className="text-xs text-emerald-600">{companyOpen ? "▼" : "▶"} {companyDocs.length}</span>
        </button>
        {companyOpen && (
          <div className="p-3 space-y-2 bg-emerald-50/30">
            {companyDocs.length === 0
              ? <p className="text-xs text-slate-400 py-2">No company documents for this process area yet.</p>
              : companyDocs.map((d) => renderDoc(d, false))}
          </div>
        )}
      </div>
    </div>
  );
}
