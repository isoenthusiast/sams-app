"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { showToast } from "@/components/Toast";
import { AttachmentList } from "@/components/AttachmentList";
import { CommentThread } from "@/components/CommentThread";

type EvidenceStatus = "Draft" | "Requested" | "Submitted" | "Accepted" | "Rejected" | "NotApplicable";

type MyRequest = {
  id: string;
  title: string;
  instructions: string;
  status: EvidenceStatus;
  dueDate: string | null;
  submittedNote: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  requestedByUserId: string;
  requestedBy?: { id: string; name: string; username?: string | null } | null;
  requestedFromUserId: string;
  assessment?: { id: string; name: string; companyId?: string | null } | null;
  createdAt: string;
};

const STATUS_STYLES: Record<EvidenceStatus, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Requested: "bg-blue-100 text-blue-700",
  Submitted: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700",
  NotApplicable: "bg-slate-100 text-slate-500",
};

/**
 * /fla/my-evidence-requests — requestee home. Cards per request: instructions,
 * due date (overdue red), status, submit box (note + attachment upload),
 * resubmit after rejection with the review note visible. Requestee sees only
 * their own requests (the API returns ?mine=1).
 */
export function MyEvidenceRequestsClient() {
  const { isAuthenticated, isLoading } = useSession();
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/evidence-requests?mine=1");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      const data = await res.json();
      setRequests(Array.isArray(data.evidenceRequests) ? data.evidenceRequests : []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load evidence requests", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchRequests();
  }, [fetchRequests, isAuthenticated]);

  if (isLoading) return null;

  const isOverdue = (r: MyRequest) =>
    r.status === "Requested" && r.dueDate && new Date(r.dueDate).getTime() < Date.now();

  const actionable = requests.filter((r) => r.status === "Requested" || r.status === "Rejected");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">My Evidence Requests</h1>
          <p className="text-sm text-slate-500">Evidence needed from you, and the status of each.</p>
        </div>
        <Link href="/fla" className="text-sm text-blue-600 hover:underline">← Back to FLA</Link>
      </div>

      {actionable.length > 0 && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You have {actionable.length} evidence request{actionable.length > 1 ? "s" : ""} needing{" "}
          {actionable.some((r) => r.status === "Rejected") ? "a resubmission or" : ""} a response.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-400">No evidence requested from you yet.</p>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{r.title}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                    {isOverdue(r) && <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">OVERDUE</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{r.instructions}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {r.assessment ? `Assessment: ${r.assessment.name}` : "—"}
                    {r.dueDate && <> · Due: {new Date(r.dueDate).toLocaleDateString()}</>}
                    {r.submittedAt && <> · Submitted: {new Date(r.submittedAt).toLocaleString()}</>}
                  </p>
                  {r.requestedBy?.name && <p className="mt-0.5 text-[11px] text-slate-400">Requested by: {r.requestedBy.name}</p>}
                  {r.status === "Rejected" && r.reviewNote && (
                    <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                      <strong>Review note:</strong> {r.reviewNote}
                    </p>
                  )}
                  {r.submittedNote && (
                    <p className="mt-1 text-xs text-slate-600"><strong>My note:</strong> {r.submittedNote}</p>
                  )}
                </div>
              </div>

              {(r.status === "Requested" || r.status === "Rejected") && (
                <RequesteeSubmit requestId={r.id} onDone={fetchRequests} status={r.status} />
              )}

              {(r.status === "Requested" || r.status === "Submitted" || r.status === "Accepted" || r.status === "Rejected") && (
                <AttachmentList destTable="EvidenceRequest" recId={r.id} />
              )}

              <CommentThread entityType="EvidenceRequest" entityId={r.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RequesteeSubmit({ requestId, onDone, status }: { requestId: string; onDone: () => Promise<void>; status: EvidenceStatus }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/evidence-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", submittedNote: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      showToast("Evidence submitted", "success");
      setNote("");
      await onDone();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submit failed", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-2 rounded border border-slate-100 bg-slate-50 p-2">
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {status === "Rejected" ? "Resubmit evidence" : "Submit evidence"}
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Provide your evidence / a response to the review note (or add an attachment below)…"
        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">Adding an attachment below counts too.</span>
        <button type="submit" disabled={busy} className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50">
          {busy ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
  );
}
