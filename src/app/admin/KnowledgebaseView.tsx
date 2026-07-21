"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { formatDate } from "@/lib/formatDate";

type KbEntry = {
  kID: string;
  knowledgeName: string;
  knowledgeContent: string;
  remarks: string | null;
  createdDate: string;
  addedBy: string;
  processAreaName: string | null;
};

type Props = {
  entries: KbEntry[];
  processAreas: { id: string; name: string }[];
  companyId: string | null;
};

export function KnowledgebaseView({ entries, processAreas, companyId }: Props) {
  const [search, setSearch] = useState("");
  const [paFilter, setPaFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [paId, setPaId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState(entries);

  const filtered = data.filter((e) => {
    if (search && !e.knowledgeName.toLowerCase().includes(search.toLowerCase()) && !e.knowledgeContent.toLowerCase().includes(search.toLowerCase())) return false;
    if (paFilter && e.processAreaName !== paFilter) return false;
    return true;
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file && !content.trim()) return;

    setUploading(true);
    setUploadMsg(null);

    try {
      if (file) {
        // Text-based upload: .md, .txt, .csv
        const text = await file.text();
        const res = await fetch("/api/admin/table/Knowledgebase/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgeName: name || file.name.replace(/\.[^.]+$/, ""),
            knowledgeContent: text,
            processAreaId: paId || null,
            companyId: companyId,
            addedBy: "Admin",
          }),
        });
        if (!res.ok) throw new Error("Upload failed");
      } else {
        const res = await fetch("/api/admin/table/Knowledgebase/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgeName: name,
            knowledgeContent: content,
            processAreaId: paId || null,
            companyId: companyId,
            addedBy: "Admin",
          }),
        });
        if (!res.ok) throw new Error("Upload failed");
      }

      setUploadMsg({ type: "ok", text: "Entry created. Refresh to see it." });
      setName("");
      setContent("");
      setPaId("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setUploadMsg({ type: "err", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Upload form */}
      <Card title="📤 Add Knowledgebase Entry" padding="sm">
        <form onSubmit={handleUpload} className="space-y-3">
          <Input
            label="Entry Name"
            value={name}
            onChange={setName}
            placeholder="e.g., Process Walkthrough Notes"
            required
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Upload File (.md, .txt, .csv) or paste content below</label>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.csv,.json"
              className="text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
              aria-label="Upload knowledgebase file"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Or paste content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none min-h-[100px]"
              placeholder="Paste markdown or text content here…"
              aria-label="Knowledgebase content"
            />
          </div>
          <div className="w-64">
            <label className="block text-xs font-medium text-slate-600 mb-1">Process Area (optional)</label>
            <select
              value={paId}
              onChange={(e) => setPaId(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              aria-label="Process area"
            >
              <option value="">None</option>
              {processAreas.map((pa) => (
                <option key={pa.id} value={pa.id}>{pa.name}</option>
              ))}
            </select>
          </div>
          <Button variant="primary" size="sm" disabled={uploading || (!name.trim() && !content.trim())}>
            {uploading ? "Uploading…" : "📎 Add Entry"}
          </Button>
        </form>
        {uploadMsg && (
          <div className={`mt-3 text-sm px-3 py-2 rounded ${uploadMsg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`} role="alert">
            {uploadMsg.text}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Supports .md, .txt, .csv, .json files. For .docx/.pdf, use the{" "}
          <code className="bg-slate-100 px-1 rounded">/api/convert</code> endpoint.
        </p>
      </Card>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Search by name or content…"
          />
        </div>
        <div className="w-48">
          <label className="block text-xs font-medium text-slate-600 mb-1">Process Area</label>
          <select
            value={paFilter}
            onChange={(e) => setPaFilter(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            aria-label="Filter by process area"
          >
            <option value="">All</option>
            {processAreas.map((pa) => (
              <option key={pa.id} value={pa.name}>{pa.name}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-sm text-slate-500">{filtered.length} of {data.length} entr{data.length !== 1 ? "ies" : "y"}</p>

      {/* Entry list */}
      <div className="space-y-3">
        {filtered.map((entry) => (
          <Card key={entry.kID} padding="sm">
            <h3 className="font-semibold text-slate-900">{entry.knowledgeName}</h3>
            <div className="text-xs text-slate-500 mt-1">
              Added by {entry.addedBy} · {formatDate(entry.createdDate)}
              {entry.processAreaName && <> · {entry.processAreaName}</>}
            </div>
            <details className="mt-2">
              <summary className="text-xs text-blue-600 cursor-pointer hover:underline focus:outline-2 focus:outline-blue-500 rounded">
                View Content
              </summary>
              <pre className="mt-2 text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-3 max-h-96 overflow-y-auto">
                {entry.knowledgeContent}
              </pre>
            </details>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">No entries found.</p>
        )}
      </div>
    </div>
  );
}
