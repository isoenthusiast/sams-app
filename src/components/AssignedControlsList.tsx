"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CollapsibleSection } from "@/components/CollapsibleSection";
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

  // Build hierarchy: ProcessArea → Requirement → Controls
  const hierarchy = (() => {
    const paMap = new Map<string, {
      paId: string;
      paName: string;
      standardName: string;
      requirements: Map<string, {
        reqId: string;
        reqLabel: string;
        controls: ControlAssignment[];
      }>;
    }>();

    for (const ca of assignments) {
      const pa = ca.control?.processArea;
      const paId = pa?.id ?? "__unknown__";
      const paName = pa?.name ?? "Unknown Process Area";
      const standardName = pa?.standardRef?.standard ?? "";

      if (!paMap.has(paId)) {
        paMap.set(paId, { paId, paName, standardName, requirements: new Map() });
      }
      const paEntry = paMap.get(paId)!;
      const reqMappings = ca.control?.requirementMappings ?? [];

      if (reqMappings.length === 0) {
        const key = "__unmapped__";
        if (!paEntry.requirements.has(key)) {
          paEntry.requirements.set(key, { reqId: key, reqLabel: "Unmapped Controls", controls: [] });
        }
        paEntry.requirements.get(key)!.controls.push(ca);
      } else {
        for (const rm of reqMappings) {
          const req = rm.requirement;
          const reqLabel = req.clauseContent
            ? `${req.requirementId}: ${req.clauseContent.substring(0, 80)}`
            : req.requirementId;
          if (!paEntry.requirements.has(req.requirementId)) {
            paEntry.requirements.set(req.requirementId, { reqId: req.requirementId, reqLabel, controls: [] });
          }
          paEntry.requirements.get(req.requirementId)!.controls.push(ca);
        }
      }
    }

    return Array.from(paMap.values()).sort((a, b) => a.paName.localeCompare(b.paName));
  })();

  const handleEffectivenessChange = async (caId: string, value: string) => {
    setUpdating(caId);
    try {
      const res = await fetch(`/api/admin/control-assignments/${caId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effective: value || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      router.refresh();
    } catch (err) {
      showToast("Failed to update effectiveness", "error");
    } finally {
      setUpdating(null);
    }
  };

  const handleRemove = async (ca: ControlAssignment) => {
    if (!confirm(`Remove "${ca.control?.name}" from assigned controls?`)) return;
    setUpdating(ca.id);
    try {
      const res = await fetch(`/api/admin/control-assignments/${ca.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      router.refresh();
    } catch (err) {
      showToast("Failed to remove control", "error");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-1">
      {hierarchy.map((pa) => {
        const paTotal = Array.from(pa.requirements.values()).reduce((s, r) => s + r.controls.length, 0);
        return (
          <CollapsibleSection
            key={pa.paId}
            title={pa.standardName ? `${pa.standardName} — ${pa.paName}` : pa.paName}
            count={paTotal}
            defaultOpen={hierarchy.length <= 2}
          >
            {Array.from(pa.requirements.values()).map((req) => {
              const reqDefaultOpen = pa.requirements.size <= 3;
              return (
                <div key={req.reqId} className="mb-1 last:mb-0">
                  <CollapsibleSection
                    title={req.reqLabel}
                    count={req.controls.length}
                    defaultOpen={reqDefaultOpen}
                  >
                    {req.controls.map((ca) => (
                      <div
                        key={ca.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                          ca.effective === "Effective"
                            ? "bg-green-50 border-green-200"
                            : ca.effective === "NotEffective"
                            ? "bg-amber-50 border-amber-200"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        {/* Control info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {ca.control?.name}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                              {ca.control?.controlType}
                            </span>
                            {ca.effectiveUpdatedAt && (
                              <span>
                                Updated {new Date(ca.effectiveUpdatedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Effectiveness dropdown */}
                        <select
                          value={ca.effective ?? ""}
                          onChange={(e) => handleEffectivenessChange(ca.id, e.target.value)}
                          disabled={updating === ca.id}
                          className={`rounded border px-2 py-1 text-xs shrink-0 ${
                            ca.effective === "Effective"
                              ? "border-green-300 bg-green-50 text-green-700"
                              : ca.effective === "NotEffective"
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-slate-300 bg-white text-slate-600"
                          }`}
                        >
                          <option value="">— Select —</option>
                          <option value="Effective">✓ Effective</option>
                          <option value="NotEffective">✗ Not Effective</option>
                        </select>

                        {/* Remove button */}
                        <button
                          onClick={() => handleRemove(ca)}
                          disabled={updating === ca.id}
                          className="text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0"
                          title="Remove from assignment"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </CollapsibleSection>
                </div>
              );
            })}
          </CollapsibleSection>
        );
      })}
    </div>
  );
}
