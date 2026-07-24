"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";

type ControlAssignment = {
  id: string;
  controlId: string;
  effective: string | null;
  effectiveUpdatedAt: string | null;
  control: {
    id: string;
    name: string;
    controlType: string;
    processArea: {
      id: string;
      name: string;
      standardRef?: { standard: string } | null;
    } | null;
    requirementMappings: Array<{
      requirement: {
        rId: number;
        requirementId: string;
        clauseContent?: string;
      };
    }>;
  };
};

type Props = {
  assignments: ControlAssignment[];
  totalCount: number;
};

export function AssignedControlsList({ assignments, totalCount }: Props) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedPAs, setExpandedPAs] = useState<Set<string>>(new Set());

  const togglePA = (paId: string) => {
    setExpandedPAs((prev) => {
      const next = new Set(prev);
      if (next.has(paId)) next.delete(paId); else next.add(paId);
      return next;
    });
  };

  // Build: ProcessArea → Requirement → Controls (each control appears ONCE under first requirement)
  const hierarchy = useMemo(() => {
    const paMap = new Map<string, {
      paId: string;
      paName: string;
      standardName: string;
      requirements: Map<string, { reqId: string; label: string; controls: ControlAssignment[] }>;
    }>();
    const placed = new Set<string>();

    for (const ca of assignments) {
      if (placed.has(ca.controlId)) continue;
      placed.add(ca.controlId);

      const pa = ca.control?.processArea;
      const paId = pa?.id ?? "__unknown__";
      const paName = pa?.name ?? "Unknown PA";
      const standardName = pa?.standardRef?.standard ?? "";

      if (!paMap.has(paId)) {
        paMap.set(paId, { paId, paName, standardName, requirements: new Map() });
      }
      const paEntry = paMap.get(paId)!;
      const reqMappings = ca.control?.requirementMappings ?? [];

      const req = reqMappings[0]?.requirement;
      const reqId = req?.requirementId ?? "__unmapped__";
      const label = req?.clauseContent ?? "Unmapped Controls";

      if (!paEntry.requirements.has(reqId)) {
        paEntry.requirements.set(reqId, { reqId, label, controls: [] });
      }
      paEntry.requirements.get(reqId)!.controls.push(ca);
    }

    return Array.from(paMap.values()).sort((a, b) => a.paName.localeCompare(b.paName));
  }, [assignments]);

  const handleEffectivenessChange = async (caId: string, value: string) => {
    setUpdating(caId);
    try {
      const res = await fetch(`/api/admin/control-assignments/${caId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effective: value || null }),
      });
      if (!res.ok) throw new Error("Failed");
      router.refresh();
    } catch {
      showToast("Failed to update", "error");
    } finally {
      setUpdating(null);
    }
  };

  const handleRemove = async (ca: ControlAssignment) => {
    if (!confirm(`Remove "${ca.control?.name}"?`)) return;
    setUpdating(ca.id);
    try {
      await fetch(`/api/admin/control-assignments/${ca.id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      showToast("Failed to remove", "error");
    } finally {
      setUpdating(null);
    }
  };

  if (hierarchy.length === 0) return null;

  return (
    <div className="space-y-2">
      {hierarchy.map((pa) => {
        const isOpen = expandedPAs.has(pa.paId);
        const paTotal = Array.from(pa.requirements.values()).reduce((s, r) => s + r.controls.length, 0);
        const reqs = Array.from(pa.requirements.values());

        return (
          <div key={pa.paId} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* ── PA header (only collapsible level) ── */}
            <button
              onClick={() => togglePA(pa.paId)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <span className="text-sm font-semibold text-slate-800">
                {pa.standardName ? `${pa.standardName} → ${pa.paName}` : pa.paName}
              </span>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-white text-slate-600 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                  {paTotal} control{paTotal !== 1 ? "s" : ""}
                </span>
                <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {isOpen && (
              <div className="divide-y divide-slate-100">
                {reqs.map((req) => (
                  <div key={req.reqId}>
                    {/* ── Requirement label ── */}
                    <div className="px-4 py-1.5 bg-slate-100/50 border-b border-slate-100">
                      <span className="text-xs font-medium text-slate-500">
                        {req.reqId === "__unmapped__" ? "Unmapped" : req.reqId}
                      </span>
                      {req.reqId !== "__unmapped__" && (
                        <span className="text-xs text-slate-400 ml-1">
                          — {req.label.length > 100 ? req.label.substring(0, 100) + "…" : req.label}
                        </span>
                      )}
                    </div>

                    {/* ── Controls ── */}
                    {req.controls.map((ca) => (
                      <div
                        key={ca.id}
                        className={`flex items-center gap-2 px-4 py-2 ${
                          ca.effective === "Effective"
                            ? "border-l-2 border-l-green-400 bg-green-50/30"
                            : ca.effective === "NotEffective"
                            ? "border-l-2 border-l-amber-400 bg-amber-50/30"
                            : "border-l-2 border-l-transparent"
                        }`}
                      >
                        <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                          {ca.control?.name}
                        </span>
                        <select
                          value={ca.effective ?? ""}
                          onChange={(e) => handleEffectivenessChange(ca.id, e.target.value)}
                          disabled={updating === ca.id}
                          className={`rounded border px-2 py-0.5 text-[11px] shrink-0 ${
                            ca.effective === "Effective"
                              ? "border-green-300 bg-green-50 text-green-700"
                              : ca.effective === "NotEffective"
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-slate-300 bg-white text-slate-500"
                          }`}
                        >
                          <option value="">—</option>
                          <option value="Effective">✓ Effective</option>
                          <option value="NotEffective">✗ Not Effective</option>
                        </select>
                        <button
                          onClick={() => handleRemove(ca)}
                          disabled={updating === ca.id}
                          className="text-sm text-slate-300 hover:text-red-500 shrink-0 leading-none"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
