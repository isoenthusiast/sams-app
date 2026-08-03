"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { CollapsibleSection } from "@/components/CollapsibleSection";

type ReqData = {
  rId: number; requirementId: string; clauseContent: string;
  standard: string; processAreaName: string; processAreaId: string;
};

type DocLink = { id: string; document: { id: string; filename: string; documentNo?: string; summary?: string; documentContent?: string } };

type Props = { requirements: ReqData[]; standards: { standard: string }[] };

export function RequirementDocumentsTab({ requirements, standards }: Props) {
  const [filter, setFilter] = useState("");
  const [stdFilter, setStdFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedReq, setSelectedReq] = useState<number | null>(null);
  const [docs, setDocs] = useState<DocLink[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocLink | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<any[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [linking, setLinking] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const filtered = useMemo(() => requirements.filter((r) => {
    if (filter && !r.requirementId.toLowerCase().includes(filter.toLowerCase()) && !r.clauseContent.toLowerCase().includes(filter.toLowerCase())) return false;
    if (stdFilter && r.standard !== stdFilter) return false;
    return true;
  }), [requirements, filter, stdFilter]);

  const grouped = useMemo(() => {
    const byStd = new Map<string, Map<string, ReqData[]>>();
    for (const r of filtered) {
      if (!byStd.has(r.standard)) byStd.set(r.standard, new Map());
      const byPA = byStd.get(r.standard)!;
      if (!byPA.has(r.processAreaName)) byPA.set(r.processAreaName, []);
      byPA.get(r.processAreaName)!.push(r);
    }
    return [...byStd.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggle = (rId: number) => setExpanded((p) => { const n = new Set(p); n.has(rId) ? n.delete(rId) : n.add(rId); return n; });

  const selectRequirement = async (r: ReqData) => {
    setSelectedReq(r.rId);
    setSelectedDoc(null);
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/admin/requirement-documents?requirementRId=${r.rId}`);
      if (res.ok) {
        const json = await res.json();
        setDocs(json.links || []);
      }
    } catch { /* ignore */ }
    finally { setLoadingDocs(false); }
  };

  const openLinkModal = async () => {
    setShowLinkModal(true);
    setDocSearch("");
    try {
      const res = await fetch("/api/admin/documents");
      if (res.ok) {
        const json = await res.json();
        setAvailableDocs(json.documents || []);
      }
    } catch { /* ignore */ }
  };

  const handleLinkDocument = async (docId: string) => {
    if (!selectedReq) return;
    setLinking(true);
    try {
      const res = await fetch("/api/admin/requirement-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementRId: selectedReq, documentId: docId }),
      });
      if (!res.ok) throw new Error("Link failed");
      const json = await res.json();
      setDocs((prev) => [...prev, json.link]);
      setMsg({ type: "ok", text: "Document linked." });
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Link failed" });
    }
    finally { setLinking(false); }
  };

  const handleUnlink = async (linkId: string) => {
    try {
      const res = await fetch(`/api/admin/requirement-documents?id=${linkId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Unlink failed");
      setDocs((prev) => prev.filter((d) => d.id !== linkId));
      if (selectedDoc?.id === linkId) setSelectedDoc(null);
      setMsg({ type: "ok", text: "Document unlinked." });
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Unlink failed" });
    }
  };

  return (
    <div className="flex gap-4 h-[75vh]">
      {/* LEFT: Requirement Tree */}
      <div className="w-96 shrink-0 border border-slate-200 rounded-lg bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 shrink-0 space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">📋 Requirements</h2>
          <input type="text" placeholder="Search requirements…" value={filter} onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm" />
          <select value={stdFilter} onChange={(e) => setStdFilter(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">All Standards</option>
            {standards.map((s) => (<option key={s.standard} value={s.standard}>{s.standard}</option>))}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {grouped.map(([stdName, paMap]) => (
            <CollapsibleSection key={stdName} title={stdName} count={[...paMap.values()].flat().length} defaultOpen={false}>
              {[...paMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([paName, reqs]) => (
                <CollapsibleSection key={paName} title={paName} count={reqs.length} defaultOpen={false}>
                  {reqs.map((r) => (
                    <button key={r.rId}
                      onClick={() => selectRequirement(r)}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-blue-50 ${selectedReq === r.rId ? "bg-blue-100 font-medium" : ""}`}>
                      {r.requirementId}
                    </button>
                  ))}
                </CollapsibleSection>
              ))}
            </CollapsibleSection>
          ))}
        </div>
      </div>

      {/* RIGHT: Documents */}
      <div className="flex-1 border border-slate-200 rounded-lg bg-white flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            {selectedReq ? `📄 Documents` : "← Select a requirement"}
          </h2>
          {selectedReq && (
            <Button variant="primary" size="sm" onClick={openLinkModal}>＋ Link Document</Button>
          )}
        </div>
        <div className="flex-1 flex min-h-0">
          {/* Document list */}
          <div className="w-64 shrink-0 border-r border-slate-100 overflow-y-auto px-2 py-2">
            {loadingDocs ? (
              <p className="text-xs text-slate-400 py-4 text-center">Loading…</p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No documents linked.</p>
            ) : (
              docs.map((d) => (
                <button key={d.id}
                  onClick={() => setSelectedDoc(d)}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded mb-0.5 hover:bg-slate-50 ${selectedDoc?.id === d.id ? "bg-blue-50 font-medium" : ""}`}>
                  <div className="truncate">{d.document.filename}</div>
                  {d.document.documentNo && <div className="text-slate-400">{d.document.documentNo}</div>}
                  <button onClick={(e) => { e.stopPropagation(); handleUnlink(d.id); }}
                    className="text-red-400 hover:text-red-600 text-[10px] float-right mt-0.5">×</button>
                </button>
              ))
            )}
          </div>
          {/* Document viewer */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {selectedDoc ? (
              <div className="text-sm">
                <h3 className="font-semibold text-slate-800 mb-1">{selectedDoc.document.filename}</h3>
                {selectedDoc.document.documentNo && <p className="text-xs text-slate-500 mb-2">Ref: {selectedDoc.document.documentNo}</p>}
                {selectedDoc.document.summary && <p className="text-xs text-slate-600 mb-3 italic">{selectedDoc.document.summary}</p>}
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700 border-t pt-3">
                  {selectedDoc.document.documentContent || "(No content)"}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">Select a document to view.</p>
            )}
          </div>
        </div>
        {msg && (
          <div className={`px-4 py-2 text-xs ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</div>
        )}
      </div>

      {/* Link Document Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowLinkModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold">🔗 Link Document</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>
            <div className="px-6 py-3 border-b shrink-0">
              <input type="text" placeholder="Search documents…" value={docSearch} onChange={(e) => setDocSearch(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm" autoFocus />
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {availableDocs.filter((d: any) => !docSearch || d.filename?.toLowerCase().includes(docSearch.toLowerCase()) || d.documentNo?.toLowerCase().includes(docSearch.toLowerCase()))
                .slice(0, 30).map((d: any) => (
                  <button key={d.id} onClick={() => handleLinkDocument(d.id)} disabled={linking}
                    className="w-full text-left flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-blue-50 disabled:opacity-50">
                    <span className="text-blue-400">＋</span>
                    <span className="flex-1 truncate">{d.filename}</span>
                    {d.documentNo && <span className="text-xs text-slate-400">{d.documentNo}</span>}
                  </button>
                ))}
            </div>
            <div className="px-6 py-3 border-t shrink-0 flex justify-end">
              <button onClick={() => setShowLinkModal(false)} className="rounded bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
