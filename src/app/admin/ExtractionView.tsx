"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";

interface DocItem {
  id: string;
  docNo: number;
  documentTitle: string;
  documentType: string | null;
  status: string;
  createdAt: string;
  totalCandidates: number;
  pendingCandidates: number;
  approvedCandidates: number;
  rejectedCandidates: number;
}

interface Candidate {
  id: string;
  name: string;
  statement: string;
  controlType: string;
  controlTypeDetail: string | null;
  processAreaId: string;
  isHsseCritical: boolean;
  ramRating: string | null;
  riskWeight: number;
  csfWho: string | null;
  csfWhat: string | null;
  csfWhen: string | null;
  csfWhere: string | null;
  csfWhy: string | null;
  csfHow: string | null;
  csfEvidence: string | null;
  standard: string | null;
  pId: string | null;
  Requirements: string | null;
  keyActivities: string | null;
  riskAddressed: string | null;
  keyRiskIndicator: string | null;
  status: string;
  approvedControlId: string | null;
}

interface ProcessArea {
  id: string;
  name: string;
  pId: string | null;
  standard: string | null;
}

interface RequirementOption {
  rId: number;
  requirementId: string;
  standard: string;
  processAreaId: string | null;
  clauseContent: string;
}

export function ExtractionView() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [processAreas, setProcessAreas] = useState<ProcessArea[]>([]);
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPA, setUploadPA] = useState<string>("");
  const [editingCandidate, setEditingCandidate] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Candidate>>({});

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/extraction");
      const data = await res.json();
      setDocs(data.items || []);
    } catch (e) {
      setError("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const fetchCandidates = async (docId: string) => {
    setSelectedDocId(docId);
    try {
      const res = await fetch(`/api/admin/extraction?docId=${docId}`);
      const data = await res.json();
      setSelectedDoc(data.document);
      setCandidates(data.candidates || []);
      setProcessAreas(data.processAreas || []);
      setRequirements(data.requirements || []);
    } catch {
      setError("Failed to load candidates");
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (uploadPA) formData.append("processAreaId", uploadPA);

    try {
      const res = await fetch("/api/admin/extraction", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploadFile(null);
      await fetchDocs();
      // Auto-select the new doc
      if (data.document?.id) fetchCandidates(data.document.id);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleReview = async (candidateId: string, action: "approve" | "reject", edits?: Partial<Candidate>) => {
    setProcessingAction(candidateId);
    try {
      const res = await fetch("/api/admin/extraction", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidateId, action, edits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");
      setEditingCandidate(null);
      // Refresh candidates
      if (selectedDocId) fetchCandidates(selectedDocId);
      await fetchDocs();
    } catch (e: any) {
      setError(e.message || "Review failed");
    } finally {
      setProcessingAction(null);
    }
  };

  const startEditing = (c: Candidate) => {
    setEditingCandidate(c.id);
    setEditForm({ ...c });
  };

  // ── Derived: unique standards from company's process areas ──
  const availableStandards = [...new Set(processAreas.map(pa => pa.standard).filter((s): s is string => !!s))].sort();

  // Filter PAs by selected standard, requirements by selected PA
  const filteredPAs = editForm.standard
    ? processAreas.filter(pa => pa.standard === editForm.standard)
    : processAreas;
  const filteredReqs = editForm.processAreaId
    ? requirements.filter(r => r.processAreaId === editForm.processAreaId)
    : requirements;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Uploaded: "bg-yellow-100 text-yellow-800",
      Extracting: "bg-blue-100 text-blue-800",
      Extracted: "bg-green-100 text-green-800",
      Completed: "bg-slate-100 text-slate-800",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-slate-100 text-slate-600"}`}>
        {status}
      </span>
    );
  };

  const candidateStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Pending: "bg-yellow-100 text-yellow-800",
      Approved: "bg-green-100 text-green-800",
      Rejected: "bg-red-100 text-red-800",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-slate-100"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Upload Area */}
      <Card title="📄 Upload Document" subtitle="Upload .pdf, .md, .csv, .txt, or .docx for AI extraction" padding="md">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".pdf,.md,.csv,.txt,.docx"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            <Button onClick={handleUpload} disabled={!uploadFile || uploading} variant="primary">
              {uploading ? "Extracting…" : "Upload & Extract"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Target Process Area (optional):</label>
            <select
              value={uploadPA}
              onChange={(e) => setUploadPA(e.target.value)}
              className="text-sm border border-slate-200 rounded-md px-2 py-1"
            >
              <option value="">Any / Auto-detect</option>
              {processAreas.map((pa) => (
                <option key={pa.id} value={pa.id}>{pa.name}</option>
              ))}
            </select>
          </div>
          {uploadFile && (
            <p className="text-xs text-slate-400">Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</p>
          )}
        </div>
        {error && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">✕</button>
          </div>
        )}
      </Card>

      {/* Document List */}
      <Card title="📋 Documents" subtitle={`${docs.length} document(s)`} padding="md">
        {loading ? (
          <p className="text-sm text-slate-400 py-4">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No documents yet. Upload one above.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id}>
                <button
                  onClick={() => fetchCandidates(doc.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors hover:bg-slate-50 ${selectedDocId === doc.id ? "border-slate-400 bg-slate-50" : "border-slate-200"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono">#{doc.docNo}</span>
                      <span className="text-sm font-medium text-slate-900">{doc.documentTitle}</span>
                      {doc.documentType && (
                        <span className="text-xs text-slate-400 uppercase">{doc.documentType}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(doc.status)}
                      {doc.totalCandidates > 0 && (
                        <span className="text-xs text-slate-500">
                          {doc.totalCandidates} candidates ({doc.pendingCandidates} pending)
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Candidates Panel */}
                {selectedDocId === doc.id && (
                  <div className="mt-2 ml-4 border-l-2 border-slate-200 pl-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-slate-700">
                        Candidates ({candidates.length})
                      </h3>
                      <button
                        onClick={() => setSelectedDocId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        Close ✕
                      </button>
                    </div>

                    {candidates.length === 0 ? (
                      <p className="text-sm text-slate-400 py-2">No candidates found.</p>
                    ) : (
                      candidates.map((c) => (
                        <div key={c.id} className="rounded-md border border-slate-200 p-3 bg-white">
                          {editingCandidate === c.id ? (
                            /* ── Edit Form ── */
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-700">✏️ Editing Candidate</span>
                                <button onClick={() => setEditingCandidate(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-slate-500">Name</label>
                                  <input className="w-full border rounded px-2 py-1 text-sm" value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Control Type</label>
                                  <select className="w-full border rounded px-2 py-1 text-sm" value={editForm.controlType || "Procedural"} onChange={e => setEditForm({...editForm, controlType: e.target.value})}>
                                    {["Administrative","Procedural","Analytical","Behavioral","Informational","Engineering"].map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Who (Role)</label>
                                  <input className="w-full border rounded px-2 py-1 text-sm" value={editForm.csfWho || ""} onChange={e => setEditForm({...editForm, csfWho: e.target.value})} />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">When (Frequency)</label>
                                  <select className="w-full border rounded px-2 py-1 text-sm" value={editForm.csfWhen || ""} onChange={e => setEditForm({...editForm, csfWhen: e.target.value})}>
                                    <option value="">—</option>
                                    {["Daily","Weekly","Monthly","Quarterly","Annually","As Needed","Continuous","Per Shift","Before Each Use","After Each Use"].map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Where</label>
                                  <input className="w-full border rounded px-2 py-1 text-sm" value={editForm.csfWhere || ""} onChange={e => setEditForm({...editForm, csfWhere: e.target.value})} />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">What</label>
                                  <input className="w-full border rounded px-2 py-1 text-sm" value={editForm.csfWhat || ""} onChange={e => setEditForm({...editForm, csfWhat: e.target.value})} />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Why (Risk Addressed)</label>
                                  <input className="w-full border rounded px-2 py-1 text-sm" value={editForm.csfWhy || ""} onChange={e => setEditForm({...editForm, csfWhy: e.target.value})} />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Evidence</label>
                                  <input className="w-full border rounded px-2 py-1 text-sm" value={editForm.csfEvidence || ""} onChange={e => setEditForm({...editForm, csfEvidence: e.target.value})} />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Standard</label>
                                  <select
                                    className="w-full border rounded px-2 py-1 text-sm"
                                    value={editForm.standard || ""}
                                    onChange={e => setEditForm({...editForm, standard: e.target.value || null, processAreaId: "", Requirements: "Unmapped Controls"})}
                                  >
                                    <option value="">— Select Standard —</option>
                                    {availableStandards.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Process Area</label>
                                  <select
                                    className="w-full border rounded px-2 py-1 text-sm"
                                    value={editForm.processAreaId || ""}
                                    onChange={e => setEditForm({...editForm, processAreaId: e.target.value || "", Requirements: "Unmapped Controls"})}
                                  >
                                    <option value="">— Select PA —</option>
                                    {filteredPAs.map(pa => <option key={pa.id} value={pa.id}>{pa.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Map to Requirement</label>
                                  <select
                                    className="w-full border rounded px-2 py-1 text-sm"
                                    value={editForm.Requirements || "Unmapped Controls"}
                                    onChange={e => setEditForm({...editForm, Requirements: e.target.value})}
                                  >
                                    <option value="Unmapped Controls">Unmapped Controls</option>
                                    {filteredReqs.map(r => (
                                      <option key={r.rId} value={r.requirementId}>
                                        {r.requirementId} — {(r.clauseContent || "").substring(0, 80)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" id={`hsse-${c.id}`} checked={editForm.isHsseCritical || false} onChange={e => setEditForm({...editForm, isHsseCritical: e.target.checked})} />
                                  <label htmlFor={`hsse-${c.id}`} className="text-xs text-slate-500">HSSE Critical</label>
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">Statement</label>
                                <textarea className="w-full border rounded px-2 py-1 text-sm" rows={3} value={editForm.statement || ""} onChange={e => setEditForm({...editForm, statement: e.target.value})} />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500">How (Method)</label>
                                <textarea className="w-full border rounded px-2 py-1 text-sm" rows={2} value={editForm.csfHow || ""} onChange={e => setEditForm({...editForm, csfHow: e.target.value})} />
                              </div>
                              <div className="flex items-center gap-2 justify-end">
                                <Button size="sm" variant="secondary" onClick={() => setEditingCandidate(null)}>Cancel</Button>
                                <Button size="sm" variant="primary" onClick={() => handleReview(c.id, "approve", editForm)} disabled={processingAction === c.id}>
                                  {processingAction === c.id ? "Saving…" : "✓ Save & Approve"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            /* ── Display View ── */
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-slate-900">{c.name}</span>
                                  <Badge variant="default">{c.controlType}</Badge>
                                  {candidateStatusBadge(c.status)}
                                </div>
                                <p className="text-xs text-slate-600 mt-1 line-clamp-2">{c.statement}</p>
                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1">
                                  {c.csfWho && <span className="text-xs text-slate-500">👤 {c.csfWho}</span>}
                                  {c.csfWhen && <span className="text-xs text-slate-500">⏰ {c.csfWhen}</span>}
                                  {c.csfWhere && <span className="text-xs text-slate-500">📍 {c.csfWhere}</span>}
                                  {c.Requirements && <span className="text-xs text-slate-500">📋 {c.Requirements}</span>}
                                </div>
                              </div>

                              {c.status === "Pending" && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button size="sm" variant="secondary" onClick={() => startEditing(c)}>
                                    ✏️ Edit
                                  </Button>
                                  <Button size="sm" variant="primary" onClick={() => handleReview(c.id, "approve")} disabled={processingAction === c.id}>
                                    ✓ Approve
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => handleReview(c.id, "reject")} disabled={processingAction === c.id}>
                                    ✗ Reject
                                  </Button>
                                </div>
                              )}
                              {c.status === "Approved" && (
                                <span className="text-xs text-green-600 flex-shrink-0">✅ In Library</span>
                              )}
                              {c.status === "Rejected" && (
                                <span className="text-xs text-red-500 flex-shrink-0">❌ Rejected</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
