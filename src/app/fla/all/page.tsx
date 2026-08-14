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
  processArea: { id: string; name: string; standard: string | null } | null;
  _count: { samples: number; findings: number };
}

interface PAGroup {
  paId: string;
  paName: string;
  assessments: Assessment[];
}

interface StdGroup {
  stdKey: string;
  stdName: string;
  pas: PAGroup[];
}

function AllAssessmentsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const companyId = sp.get("companyId") || "";
  const [groups, setGroups] = useState<StdGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/assessments?companyId=${companyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.assessments) {
          const stdMap = new Map<string, StdGroup>();
          for (const a of data.assessments) {
            const stdName = a.processArea?.standard || "Uncategorized";
            const paid = a.processArea?.id || "_none";
            const paname = a.processArea?.name || "Uncategorized";
            if (!stdMap.has(stdName)) {
              stdMap.set(stdName, { stdKey: stdName, stdName, pas: [] });
            }
            const sg = stdMap.get(stdName)!;
            let pg = sg.pas.find((p) => p.paId === paid);
            if (!pg) {
              pg = { paId: paid, paName: paname, assessments: [] };
              sg.pas.push(pg);
            }
            pg.assessments.push(a);
          }
          const sorted = Array.from(stdMap.values()).sort((x, y) => {
            if (x.stdName === "International Standards (ISO)") return -1;
            if (y.stdName === "International Standards (ISO)") return 1;
            return x.stdName.localeCompare(y.stdName);
          });
          setGroups(sorted);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [companyId]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
                pas: g.pas
                  .map((pg) => ({
                    ...pg,
                    assessments: pg.assessments.filter((a) => a.id !== id),
                  }))
                  .filter((pg) => pg.assessments.length > 0),
              }))
              .filter((g) => g.pas.length > 0)
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

  const total = groups.reduce(
    (s, g) => s + (g.pas ? g.pas.reduce((x, p) => x + (p.assessments?.length ?? 0), 0) : 0),
    0
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Assessments</h1>
          <p className="text-sm text-slate-500">
            Grouped by Standard → Process Area · {total} assessment{total !== 1 ? "s" : ""}
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
        <div className="space-y-4">
          {groups.map((g) => {
            const stdOpen = expanded.has(`std:${g.stdKey}`);
            return (
              <div key={g.stdKey} className="rounded-lg border border-slate-200 bg-white">
                <button
                  onClick={() => toggle(`std:${g.stdKey}`)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{stdOpen ? "▼" : "▶"}</span>
                    <span className="font-bold text-slate-900">📚 {g.stdName}</span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {(g.pas || []).length} PA{(g.pas || []).length !== 1 ? "s" : ""} ·{" "}
                      {(g.pas || []).reduce((s, p) => s + (p.assessments?.length ?? 0), 0)} assessment
                    </span>
                  </div>
                </button>

                {stdOpen && (
                  <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-2">
                    {(g.pas || []).map((pg) => {
                      const paKey = `pa:${g.stdKey}||${pg.paId}`;
                      const paOpen = expanded.has(paKey);
                      return (
                        <div key={paKey} className="rounded-md border border-slate-200 bg-white">
                          <button
                            onClick={() => toggle(paKey)}
                            className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{paOpen ? "▼" : "▶"}</span>
                              <span className="font-semibold text-slate-900">{pg.paName}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                {(pg.assessments || []).length}
                              </span>
                            </div>
                          </button>

                          {paOpen && (
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
                                  {(pg.assessments || []).map((a) => (
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
                                          <a
                                            href={`/fla/${a.id}?companyId=${companyId}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                            title="Open assessment (new tab)"
                                          >
                                            ✏️
                                          </a>
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
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
