"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

interface Assessment {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  loa: string;
  activityType: { name: string } | null;
  assessor: { name: string } | null;
  processArea: { id: string; name: string } | null;
  _count: { samples: number; findings: number };
}

interface PAGroup {
  paId: string;
  paName: string;
  assessments: Assessment[];
}

function AllAssessmentsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const companyId = sp.get("companyId") || "";
  const [groups, setGroups] = useState<PAGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/assessments?companyId=${companyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.assessments) {
          const map = new Map<string, PAGroup>();
          for (const a of data.assessments) {
            const paid = a.processArea?.id || "_none";
            const paname = a.processArea?.name || "Uncategorized";
            if (!map.has(paid)) {
              map.set(paid, { paId: paid, paName: paname, assessments: [] });
            }
            map.get(paid)!.assessments.push(a);
          }
          setGroups(Array.from(map.values()));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [companyId]);

  function toggle(paId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(paId)) next.delete(paId);
      else next.add(paId);
      return next;
    });
  }

  function doDelete(id: string) {
    setDeleting(id);
    fetch(`/api/admin/assessments/${id}?companyId=${companyId}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((data) => {
        if (data.deleted) {
          setGroups((prev) =>
            prev
              .map((g) => ({
                ...g,
                assessments: g.assessments.filter((a) => a.id !== id),
              }))
              .filter((g) => g.assessments.length > 0)
          );
        } else {
          alert("Failed to delete: " + (data.error || "unknown"));
        }
        setDeleting(null);
        setConfirmDelete(null);
      })
      .catch((err) => {
        alert("Delete failed: " + err.message);
        setDeleting(null);
        setConfirmDelete(null);
      });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <p className="text-slate-500">Loading assessments...</p>
      </div>
    );
  }

  const total = groups.reduce((s, g) => s + g.assessments.length, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Assessments</h1>
          <p className="text-sm text-slate-500">
            Grouped by Process Area · {total} assessment{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/fla")}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Back to Dashboard
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No assessments found for this company.</p>
          <button
            onClick={() => router.push("/fla/new")}
            className="mt-4 inline-block rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900"
          >
            + Create First Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.paId} className="rounded-lg border border-slate-200 bg-white">
              <button
                onClick={() => toggle(g.paId)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{expanded.has(g.paId) ? "▼" : "▶"}</span>
                  <span className="font-semibold text-slate-900">{g.paName}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {g.assessments.length}
                  </span>
                </div>
              </button>

              {expanded.has(g.paId) && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">LOA</th>
                        <th className="px-4 py-2">Assessor</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2 text-center">Findings</th>
                        <th className="px-4 py-2 text-center">Samples</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.assessments.map((a) => (
                        <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-900 max-w-xs truncate">{a.name}</td>
                          <td className="px-4 py-2 text-slate-600">{a.activityType?.name || "—"}</td>
                          <td className="px-4 py-2 text-slate-600">{a.loa || "—"}</td>
                          <td className="px-4 py-2 text-slate-600">{a.assessor?.name || "—"}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                a.status === "Completed"
                                  ? "bg-green-100 text-green-800"
                                  : a.status === "InProgress"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {a.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-500 text-xs">
                            {a.startDate ? new Date(a.startDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-2 text-center text-slate-600">{a._count.findings}</td>
                          <td className="px-4 py-2 text-center text-slate-600">{a._count.samples}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => router.push(`/fla/${a.id}?companyId=${companyId}`)}
                                className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                title="Edit assessment"
                              >
                                ✏️
                              </button>
                              {confirmDelete === a.id ? (
                                <span className="flex items-center gap-1">
                                  <button
                                    onClick={() => doDelete(a.id)}
                                    disabled={deleting === a.id}
                                    className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {deleting === a.id ? "..." : "✓ Confirm"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                                  >
                                    ✕
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(a.id)}
                                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                  title="Delete assessment"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AllAssessmentsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-6"><p className="text-slate-500">Loading...</p></div>}>
      <AllAssessmentsContent />
    </Suspense>
  );
}
