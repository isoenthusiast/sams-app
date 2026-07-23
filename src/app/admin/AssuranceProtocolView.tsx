"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";

type Protocol = {
  id: string;
  requirementId: string;
  rId: number;
  processAreaName: string | null;
  pId: string | null;
  reqNo: string;
  objective: string | null;
  risk: string | null;
  intent: string | null;
  requirement: string | null;
  keyQuestions: string | null;
  whatGoodLooksLike: string | null;
  controlPoints: string | null;
  linkageToOtherRequirements: string | null;
};

export function AssuranceProtocolView() {
  const [items, setItems] = useState<Protocol[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [paFilter, setPaFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [processAreas, setProcessAreas] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (paFilter) params.set("processAreaName", paFilter);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/admin/assurance-protocols?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (e) {
      console.error("Fetch protocols error:", e);
    } finally {
      setLoading(false);
    }
  }, [search, paFilter, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load distinct process areas for filter dropdown
  useEffect(() => {
    fetch("/api/admin/assurance-protocols?limit=10000")
      .then((r) => r.json())
      .then((data) => {
        const pas = [...new Set((data.items || []).map((i: Protocol) => i.processAreaName).filter(Boolean))].sort();
        setProcessAreas(pas as string[]);
      })
      .catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const truncate = (text: string | null, len = 80) => {
    if (!text) return "—";
    return text.length > len ? text.substring(0, len) + "…" : text;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Search</label>
          <input
            type="text"
            placeholder="Search objectives, requirements…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-64 border border-slate-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Process Area</label>
          <select
            value={paFilter}
            onChange={(e) => { setPaFilter(e.target.value); setPage(1); }}
            className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
          >
            <option value="">All Process Areas</option>
            {processAreas.map((pa) => (
              <option key={pa} value={pa}>{pa}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-slate-500 self-end pb-1">
          {total} protocols
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-slate-400">No protocols found</div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">Req No.</th>
                <th className="px-3 py-2">Process Area</th>
                <th className="px-3 py-2">pId</th>
                <th className="px-3 py-2">rId</th>
                <th className="px-3 py-2">Objective</th>
                <th className="px-3 py-2">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <>
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => toggle(item.id)}
                  >
                    <td className="px-3 py-2 text-slate-400">
                      {expanded.has(item.id) ? "▼" : "▶"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {item.reqNo || item.requirementId}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={item.processAreaName || ""}>
                      {item.processAreaName || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{item.pId || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.rId}</td>
                    <td className="px-3 py-2 max-w-[300px] truncate" title={item.objective || ""}>
                      {truncate(item.objective, 60)}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={item.risk || ""}>
                      {truncate(item.risk, 40)}
                    </td>
                  </tr>
                  {expanded.has(item.id) && (
                    <tr key={`${item.id}-detail`} className="bg-slate-50">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          {item.requirement && (
                            <div>
                              <h4 className="font-semibold text-slate-700">Requirement</h4>
                              <p className="text-slate-600 whitespace-pre-wrap mt-1">{item.requirement}</p>
                            </div>
                          )}
                          {item.intent && (
                            <div>
                              <h4 className="font-semibold text-slate-700">Intent</h4>
                              <p className="text-slate-600 whitespace-pre-wrap mt-1">{item.intent}</p>
                            </div>
                          )}
                          {item.keyQuestions && (
                            <div>
                              <h4 className="font-semibold text-slate-700">Key Questions</h4>
                              <p className="text-slate-600 whitespace-pre-wrap mt-1">{item.keyQuestions}</p>
                            </div>
                          )}
                          {item.whatGoodLooksLike && (
                            <div>
                              <h4 className="font-semibold text-slate-700">What Good Looks Like</h4>
                              <p className="text-slate-600 whitespace-pre-wrap mt-1">{item.whatGoodLooksLike}</p>
                            </div>
                          )}
                          {item.controlPoints && (
                            <div>
                              <h4 className="font-semibold text-slate-700">Control Points</h4>
                              <p className="text-slate-600 whitespace-pre-wrap mt-1">{item.controlPoints}</p>
                            </div>
                          )}
                          {item.linkageToOtherRequirements && (
                            <div>
                              <h4 className="font-semibold text-slate-700">Linkages</h4>
                              <p className="text-slate-600 whitespace-pre-wrap mt-1">{item.linkageToOtherRequirements}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </Button>
          <span className="text-sm text-slate-500 self-center">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
