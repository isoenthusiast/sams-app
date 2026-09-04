"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SAMS-013 — "Extract evidence" + per-item human review (confirm/edit/reject).
 *
 * Rendered against a single transcript. On demand, runs the AI extraction over a
 * target assessment's checklist, then lets the assessor confirm (optionally
 * edit) / reject each proposal. Confirmed → evidence lands on the checklist-item
 * audit (attachment) + draft Action; rejected → recorded, never resurfaced.
 * Unconfirmed proposals are never surfaced in SOC/exports (by construction).
 */

type Assessment = { id: string; name: string };

type Proposal = {
  id: string;
  status: string;
  assessmentId: string;
  transcriptId: string;
  transcriptTitle: string | null;
  spanStart: number;
  spanEnd: number;
  evidenceExcerpt: string;
  suggestedAction: string | null;
  confirmedByName?: string | null;
  confirmedAt?: string | null;
  rejectedByName?: string | null;
  rejectedAt?: string | null;
  checklistItem: {
    id: string;
    checklistItemId: string;
    checklistText: string;
    auditStandard: string;
  } | null;
};

type Props = {
  transcriptId: string;
  transcriptTitle: string;
  companyId: string | null;
};

export function EvidenceExtractionPanel({ transcriptId, transcriptTitle, companyId }: Props) {
  const [open, setOpen] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentId, setAssessmentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editor state: proposal id → draft excerpt
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/assessments`);
      const data = await res.json();
      const list = Array.isArray(data?.assessments) ? data.assessments : Array.isArray(data) ? data : [];
      setAssessments(list);
      if (list.length && !assessmentId) setAssessmentId(list[0].id);
    } catch {
      /* noop */
    }
  }, [assessmentId]);

  useEffect(() => {
    if (open) fetchAssessments();
  }, [open, fetchAssessments]);

  const fetchProposals = useCallback(async (status = "Proposed") => {
    if (!companyId) return;
    const res = await fetch(`/api/admin/extraction/proposals?companyId=${encodeURIComponent(companyId)}&transcriptId=${encodeURIComponent(transcriptId)}&status=${status}`);
    const data = await res.json();
    setProposals(Array.isArray(data) ? data : []);
  }, [companyId, transcriptId]);

  const runExtraction = async () => {
    if (!assessmentId) {
      setError("Select an assessment to extract against.");
      return;
    }
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/knowledgebase/transcript/${transcriptId}/extract-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, assessmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setMessage(`Extraction complete — ${data.count ?? 0} proposal(s). Review below.`);
      setExtracted(true);
      await fetchProposals("Proposed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setRunning(false);
    }
  };

  const decide = async (proposalId: string, verdict: "confirm" | "reject") => {
    setBusyId(proposalId);
    setError(null);
    try {
      const body: Record<string, unknown> = { verdict };
      if (verdict === "confirm" && editId === proposalId && draft.trim()) body.evidenceExcerpt = draft;
      const res = await fetch(`/api/admin/extraction/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verdict failed");
      setEditId(null);
      setDraft("");
      await fetchProposals("Proposed");
      if (verdict === "confirm") setMessage("Evidence linked to the checklist item.");
      else setMessage("Proposal rejected (recorded, not surfaced).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verdict failed");
    } finally {
      setBusyId(null);
    }
  };

  const bulkConfirm = async () => {
    if (!companyId) return;
    setBusyId("__bulk__");
    setError(null);
    try {
      const ids = proposals.filter((p) => p.status === "Proposed").map((p) => p.id);
      const res = await fetch(`/api/admin/extraction/proposals/bulk-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk confirm failed");
      setMessage(`Bulk confirm complete — ${data.confirmed ?? 0} confirmed.`);
      await fetchProposals("Proposed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk confirm failed");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (p: Proposal) => {
    setEditId(p.id);
    setDraft(p.evidenceExcerpt);
  };

  // Group proposed proposals by checklist item.
  const groups = new Map<string, { item: Proposal["checklistItem"]; rows: Proposal[] }>();
  for (const p of proposals) {
    if (p.status !== "Proposed") continue;
    const key = p.checklistItem?.id ?? p.id;
    if (!groups.has(key)) groups.set(key, { item: p.checklistItem, rows: [] });
    groups.get(key)!.rows.push(p);
  }
  const proposedCount = proposals.filter((p) => p.status === "Proposed").length;

  return (
    <div className="mt-3 border border-dashed border-slate-300 rounded-md p-3 bg-slate-50/60">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {open ? "▾ Hide evidence extraction" : "🤖 Extract evidence"}
        </button>
        {extracted && (
          <span className="text-[10px] text-slate-400">{proposedCount} proposed to review</span>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="min-w-[220px] flex-1">
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Assessment to extract against</label>
              <select
                value={assessmentId}
                onChange={(e) => setAssessmentId(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                aria-label="Assessment to extract against"
              >
                <option value="">Select assessment…</option>
                {assessments.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={runExtraction}
              disabled={running || !assessmentId}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {running ? "Extracting…" : "Run extraction"}
            </button>
          </div>

          {message && <p className="text-xs text-emerald-700">{message}</p>}
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

          {proposedCount > 0 && (
            <>
              {(groups.size > 0) && Array.from(groups.entries()).map(([key, grp]) => (
                <div key={key} className="rounded border border-slate-200 bg-white p-2">
                  <div className="text-[11px] font-semibold text-slate-700">
                    {grp.item?.checklistItemId && <span className="font-mono text-slate-400 mr-1">{grp.item.checklistItemId}</span>}
                    {grp.item?.checklistText?.substring(0, 140)}
                    {grp.item?.auditStandard && <span className="ml-1 text-slate-300">[{grp.item.auditStandard}]</span>}
                  </div>
                  <div className="mt-1 space-y-1">
                    {grp.rows.map((p) => (
                      <div key={p.id} className="rounded border border-slate-100 bg-slate-50 p-2">
                        {editId === p.id ? (
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={3}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            aria-label="Edit evidence excerpt"
                            autoFocus
                          />
                        ) : (
                          <p className="text-xs text-slate-700 leading-relaxed">
                            <span className="text-slate-300">
                              <span className="text-[9px] font-mono">[{p.spanStart}–{p.spanEnd}]</span>{" "}
                            </span>
                            {p.evidenceExcerpt}
                          </p>
                        )}
                        {p.suggestedAction && (
                          <p className="text-[11px] text-amber-700 mt-1">
                            <span className="font-medium">Suggested action:</span> {p.suggestedAction}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            onClick={() => startEdit(p)}
                            className="text-[10px] text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-1.5 py-0.5"
                          >
                            {editId === p.id ? "Editing…" : "✏️ Edit"}
                          </button>
                          <button
                            onClick={() => decide(p.id, "confirm")}
                            disabled={busyId === p.id}
                            className="text-[10px] bg-emerald-600 text-white rounded px-2 py-0.5 hover:bg-emerald-700 disabled:opacity-50"
                          >
                            ✓ Confirm
                          </button>
                          <button
                            onClick={() => decide(p.id, "reject")}
                            disabled={busyId === p.id}
                            className="text-[10px] bg-red-100 text-red-700 rounded px-2 py-0.5 hover:bg-red-200 disabled:opacity-50"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={bulkConfirm}
                disabled={busyId === "__bulk__"}
                className="rounded bg-slate-900 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busyId === "__bulk__" ? "Confirming…" : "✓ Confirm all reviewed"}
              </button>
            </>
          )}

          {extracted && proposedCount === 0 && (
            <p className="text-xs text-slate-400">No proposals pending review for this transcript.</p>
          )}
        </div>
      )}
    </div>
  );
}
