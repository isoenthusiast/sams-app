"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/useSession";
import { showToast } from "@/components/Toast";
import { UserSearchSelect } from "@/components/UserSearchSelect";
import { AttachmentList } from "@/components/AttachmentList";
import { CommentThread } from "@/components/CommentThread";

type EvidenceStatus = "Draft" | "Requested" | "Submitted" | "Accepted" | "Rejected" | "NotApplicable";

type EvidenceRequest = {
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
  requestedFromUserId: string;
  requestedFrom?: { id: string; name: string; username?: string | null } | null;
  assessmentId?: string | null;
  createdAt: string;
};

type Props = {
  assessmentId: string;
  assessmentName: string;
  users: Array<{ id: string; name: string; role: string }>;
  currentUserId?: string;
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
 * 📨 Evidence tab — assessor/provider view of the evidence-request pipeline for
 * an assessment: list requests (status chips), create a request (title,
 * instructions, requestee typeahead, due date), and drive accept / reject /
 * not-applicable transitions with a review note. Mounted on /fla/[id].
 */
export function EvidenceTab({ assessmentId, assessmentName, users, currentUserId }: Props) {
  const { user, isProvider, isAuthenticated } = useSession();
  const [requests, setRequests] = useState<EvidenceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [requesteeId, setRequesteeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const canManage = isProvider || user?.role === "Admin" || user?.role === "Superuser" || user?.role === "Assessor";

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/evidence-requests");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      const data = await res.json();
      const rows = (data.evidenceRequests ?? []).filter((r: EvidenceRequest) => r.assessmentId === assessmentId);
      setRequests(rows);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load evidence requests", "error");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    if (isAuthenticated) fetchRequests();
  }, [fetchRequests, isAuthenticated]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !requesteeId) return;
    setBusyId("create");
    try {
      const res = await fetch("/api/evidence-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          instructions: instructions.trim(),
          requestedFromUserId: requesteeId,
          assessmentId,
          dueDate: dueDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create request");
      showToast("Evidence request created (Draft)", "success");
      setTitle("");
      setInstructions("");
      setRequesteeId("");
      setDueDate("");
      setShowCreate(false);
      await fetchRequests();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create request", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleSend = async (id: string) => {
    await transition(id, "send");
  };
  const handleAccept = async (id: string) => {
    await transition(id, "accept");
  };
  const handleReject = async (id: string, reviewNote: string) => {
    await transition(id, "reject", { reviewNote });
  };
  const handleNa = async (id: string) => {
    await transition(id, "na");
  };

  const transition = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/evidence-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transition failed");
      showToast(`Request ${action} (${data.evidenceRequest?.status})`, "success");
      await fetchRequests();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Transition failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const isOverdue = (r: EvidenceRequest) =>
    r.status === "Requested" && r.dueDate && new Date(r.dueDate).getTime() < Date.now();

  const usersForPicker = users.map((u) => ({ id: u.id, name: u.name }));

  if (!canManage) {
    return <p className="text-sm text-slate-400">You do not have access to evidence requests.</p>;
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">
          📨 Evidence Requests <span className="text-slate-400">({requests.length})</span>
        </h3>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700"
        >
          {showCreate ? "Cancel" : "+ Request Evidence"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-3 rounded border border-slate-200 p-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Provide client sign-off memo"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Instructions *</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="What evidence is needed, and how should it be submitted?"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Requestee *</label>
              <UserSearchSelect name="requestedFromUserId" users={usersForPicker} required />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busyId === "create" || !title.trim() || !requesteeId} className="rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50">
              {busyId === "create" ? "Creating…" : "Create (Draft)"}
            </button>
            <span className="text-[10px] text-slate-400">Saved as Draft, then send to the requestee.</span>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-400">No evidence requests for this assessment.</p>
      ) : (
        requests.map((r) => (
          <div key={r.id} className="rounded border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{r.title}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                  {isOverdue(r) && <span className="text-[10px] font-medium text-red-600">OVERDUE</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 whitespace-pre-wrap">{r.instructions}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  From: {r.requestedFrom?.name ?? r.requestedFromUserId}
                  {r.dueDate && <> · Due: {new Date(r.dueDate).toLocaleDateString()}</>}
                  {r.submittedAt && <> · Submitted: {new Date(r.submittedAt).toLocaleString()}</>}
                </p>
                {r.submittedNote && <p className="mt-1 text-xs text-slate-600"><strong>Submitted note:</strong> {r.submittedNote}</p>}
                {r.reviewNote && <p className="mt-1 text-xs text-slate-600"><strong>Review note:</strong> {r.reviewNote}</p>}
              </div>
            </div>

            {/* Requestee submit surface + attachments */}
            {(r.status === "Requested" || r.status === "Rejected") && (
              <RequesteeSubmitForm requestId={r.id} onDone={fetchRequests} />
            )}
            {(r.status === "Requested" || r.status === "Submitted" || r.status === "Accepted" || r.status === "Rejected") && (
              <AttachmentList destTable="EvidenceRequest" recId={r.id} />
            )}

            {/* Assessor transition buttons */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {r.status === "Draft" && (
                <button onClick={() => handleSend(r.id)} disabled={busyId === r.id} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50">
                  {busyId === r.id ? "…" : "Send"}
                </button>
              )}
              {(r.status === "Requested" || r.status === "Submitted") && (
                <>
                  <button onClick={() => handleAccept(r.id)} disabled={busyId === r.id} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50">
                    {busyId === r.id ? "…" : "Accept"}
                  </button>
                  <RejectButton requestId={r.id} onReject={(note) => handleReject(r.id, note)} />
                </>
              )}
              {r.status === "Requested" && (
                <button onClick={() => handleNa(r.id)} disabled={busyId === r.id} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300 disabled:opacity-50">
                  {busyId === r.id ? "…" : "Not Applicable"}
                </button>
              )}
            </div>

            <CommentThread entityType="EvidenceRequest" entityId={r.id} />
          </div>
        ))
      )}
    </div>
  );
}

function RequesteeSubmitForm({ requestId, onDone }: { requestId: string; onDone: () => Promise<void> }) {
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
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Submit a note (or attach a file below)…"
        className="flex-1 min-w-[160px] rounded border border-slate-200 px-2 py-1 text-xs"
      />
      <button type="submit" disabled={busy} className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50">
        {busy ? "…" : "Submit"}
      </button>
    </form>
  );
}

function RejectButton({ requestId, onReject }: { requestId: string; onReject: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="inline-flex items-center gap-1">
      <button onClick={() => setOpen((o) => !o)} className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200">
        Reject
      </button>
      {open && (
        <div className="inline-flex items-center gap-1">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Review note…"
            className="w-36 rounded border border-slate-200 px-2 py-1 text-xs"
            autoFocus
          />
          <button
            onClick={() => { onReject(note.trim()); setNote(""); setOpen(false); }}
            className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
