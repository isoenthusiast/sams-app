"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";
import { EvidenceExtractionPanel } from "@/components/EvidenceExtractionPanel";

type Transcript = {
  kID: string;
  knowledgeName: string;
  knowledgeContent: string;
  meetingDate: string | null;
  participants: string | null;
  createdDate: string;
  addedBy: string;
  processAreaId: string | null;
  tags: string[];
};

type Props = {
  companyId: string | null;
  companies: { id: string; companyID: string }[];
  processAreas: { id: string; name: string }[];
};

export function TranscriptView({ companyId, companies, processAreas }: Props) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState(companyId || "");
  const [paId, setPaId] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [participants, setParticipants] = useState("");
  const [tags, setTags] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Filters
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const effectiveCompany = companyId || company;

  const fetchTranscripts = () => {
    setLoading(true);
    const q = effectiveCompany ? `?companyId=${encodeURIComponent(effectiveCompany)}` : "";
    fetch(`/api/admin/knowledgebase/transcript${q}`)
      .then((r) => r.json())
      .then((data) => setTranscripts(data.transcripts ?? []))
      .catch(() => showToast("Failed to load transcripts", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTranscripts(); }, [effectiveCompany]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    transcripts.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [transcripts]);

  const filtered = transcripts.filter((t) => {
    if (activeTags.length && !activeTags.every((tag) => t.tags.includes(tag))) return false;
    if (search && !t.knowledgeName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCompany) { showToast("Select a company", "error"); return; }
    if (!file && !content.trim()) { showToast("Choose a file or paste content", "error"); return; }
    if (!title.trim() && !file) { showToast("Enter a title", "error"); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      if (content.trim()) formData.append("content", content);
      formData.append("title", title.trim());
      formData.append("companyId", effectiveCompany);
      if (paId) formData.append("processAreaId", paId);
      if (meetingDate) formData.append("meetingDate", meetingDate);
      if (participants.trim()) formData.append("participants", participants.trim());
      if (tags.trim()) formData.append("tags", tags);

      const res = await fetch("/api/admin/knowledgebase/transcript", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      if (data.truncated) {
        showToast("Transcript was too long and was truncated — content may be incomplete.", "warning");
      } else {
        showToast("Transcript added", "success");
      }
      setFile(null); setContent(""); setTitle(""); setPaId("");
      setMeetingDate(""); setParticipants(""); setTags("");
      if (fileRef.current) fileRef.current.value = "";
      fetchTranscripts();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (t: Transcript) => {
    if (!confirm(`Delete transcript "${t.knowledgeName}"?`)) return;
    try {
      const res = await fetch(`/api/admin/knowledgebase/transcript/${t.kID}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showToast("Transcript deleted", "success");
      setTranscripts((prev) => prev.filter((x) => x.kID !== t.kID));
    } catch {
      showToast("Delete failed", "error");
    }
  };

  return (
    <div className="space-y-5">
      {/* Upload form */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">🎙️ Add Meeting Transcript</h3>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Transcript file (.docx/.pdf/.txt/.md/.csv/.json/.vtt/.srt)</label>
              <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md,.csv,.json,.vtt,.srt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Title {!file && "(required)"}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="e.g. Management Review — 2026-08-28" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Or paste transcript text</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[90px]" placeholder="Paste the meeting transcript here…" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {!companyId && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Company (required)</label>
                <select value={company} onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.companyID}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Process Area (optional)</label>
              <select value={paId} onChange={(e) => setPaId(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">None</option>
                {processAreas.map((pa) => <option key={pa.id} value={pa.id}>{pa.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Meeting date (optional)</label>
              <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Participants (optional)</label>
              <input value={participants} onChange={(e) => setParticipants(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="e.g. Alice, Bob, Carol" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tags (optional, comma-separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="e.g. management-review, audit" />
            </div>
          </div>

          <Button variant="primary" size="sm" disabled={uploading} type="submit">
            {uploading ? "Uploading…" : "📎 Add Transcript"}
          </Button>
        </form>
      </div>

      {/* Search + tag filter */}
      <div className="space-y-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="Search transcripts…" />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button key={tag} onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${activeTags.includes(tag) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"}`}>
                {tag}
              </button>
            ))}
            {activeTags.length > 0 && (
              <button onClick={() => setActiveTags([])} className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-600">clear</button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.kID} className="rounded border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button onClick={() => setExpandedId(expandedId === t.kID ? null : t.kID)}
                    className="text-left font-medium text-slate-800 hover:text-blue-600 break-words">
                    🎙️ {t.knowledgeName}
                  </button>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t.meetingDate ? `Meeting ${new Date(t.meetingDate).toLocaleDateString()}` : "No date"}
                    {t.participants ? ` · ${t.participants}` : ""}
                    {t.addedBy ? ` · added by ${t.addedBy}` : ""}
                  </p>
                </div>
                <button onClick={() => handleDelete(t)}
                  className="text-xs text-red-400 hover:text-red-600 shrink-0" aria-label="Delete transcript">🗑</button>
              </div>
              {t.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {t.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-500">#{tag}</span>
                  ))}
                </div>
              )}
              {expandedId === t.kID && (
                <>
                  <pre className="mt-2 text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-3 max-h-72 overflow-y-auto">
                    {t.knowledgeContent}
                  </pre>
                  <EvidenceExtractionPanel
                    transcriptId={t.kID}
                    transcriptTitle={t.knowledgeName}
                    companyId={effectiveCompany}
                  />
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No transcripts yet. Upload one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
