"use client";

import { useState, useEffect, useRef } from "react";
import { formatDate } from "@/lib/formatDate";

interface Attachment {
  id: string;
  fileName: string;
  description: string | null;
  filePath: string;
  fileSize: number | null;
  uploadedBy: string;
  uploadDate: string;
}

interface Props {
  destTable: string;
  recId: string;
}

export function AttachmentList({ destTable, recId }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAttachments();
  }, [destTable, recId]);

  const fetchAttachments = async () => {
    try {
      const res = await fetch(`/api/attachments?destTable=${destTable}&recId=${recId}`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(Array.isArray(data) ? data.filter(Boolean) : []);
      }
    } catch {}
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("destTable", destTable);
    fd.append("recId", recId);
    if (description.trim()) fd.append("description", description.trim());

    try {
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      await fetchAttachments();
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (att: Attachment) => {
    if (!confirm(`Delete "${att.fileName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/attachments/${att.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Delete failed");
      }
      setAttachments(attachments.filter(a => a.id !== att.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      <h4 className="text-xs font-medium text-slate-700 mb-2">📎 Attachments ({attachments.length})</h4>

      {error && <div className="mb-2 text-xs text-red-600">{error}</div>}

      {/* Upload form */}
      <form onSubmit={handleUpload} className="flex items-center gap-2 mb-2">
        <input
          ref={fileRef}
          type="file"
          className="text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
        />
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {uploading ? "…" : "Upload"}
        </button>
      </form>

      {/* Attachment list */}
      {attachments.length > 0 ? (
        <div className="space-y-1">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <a href={att.filePath} target="_blank" className="text-blue-600 hover:underline truncate max-w-[200px]" title={att.fileName}>
                  {att.fileName}
                </a>
                {att.description && <span className="text-slate-400 truncate max-w-[150px]">{att.description}</span>}
                <span className="text-slate-400">{formatSize(att.fileSize)}</span>
                <span className="text-slate-400">{formatDate(att.uploadDate)}</span>
              </div>
              <button onClick={() => handleDelete(att)} className="text-red-500 hover:underline ml-2 shrink-0">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">No attachments yet</p>
      )}
    </div>
  );
}
