"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { showToast } from "@/components/Toast";

// ── Types ──────────────────────────────────────────────────────────────

interface TreeControl {
  id: string;
  name: string;
  controlType: string;
  isAssigned: boolean;
}

interface TreeRequirement {
  rId: number;
  requirementId: string;
  clauseContent: string;
  controls: TreeControl[];
}

interface TreeProcessArea {
  name: string;
  requirements: TreeRequirement[];
}

interface TreeStandard {
  standard: string;
  processAreas: TreeProcessArea[];
}

interface ControlLocation {
  requirementId: string;
  processAreaName: string;
}

interface TreeData {
  standards: TreeStandard[];
  assignedControlIds: string[];
  unmappedControls: TreeControl[];
  controlLocations: Record<string, ControlLocation[]>;
  controlEffectiveness: Record<string, { effective: string | null; updatedAt: string | null; testNotes: string | null; testMethod: string | null }>;
  requirementConclusions: Record<number, { conclusion: string; narrative: string | null; lastAssessedDate: string | null }>;
}

// ── Props ──────────────────────────────────────────────────────────────

interface Props {
  assessmentId: string;
  onCreateFinding?: (prefill: { requirementRId?: number; requirementId?: string; controlId?: string; controlName?: string }) => void;
}

// ── Component ──────────────────────────────────────────────────────────

export default function ControlTreePanel({ assessmentId, onCreateFinding }: Props) {
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  // Track assigned control IDs locally for instant UI feedback
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());

  // ── Fetch tree ──────────────────────────────────────────────────────

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/assessments/${assessmentId}/requirement-tree`
      );
      const data: TreeData = await res.json();
      if (!res.ok) throw new Error((data as any).error || "Failed");
      setTreeData(data);
      setAssignedIds(new Set(data.assignedControlIds));
    } catch (e: any) {
      showToast(e.message || "Failed to load controls", "error");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // ── Toggle control assignment (API call) ────────────────────────────

  const toggleControl = useCallback(
    async (controlId: string) => {
      setSaving(true);
      const currentlyAssigned = assignedIds.has(controlId);
      try {
        if (currentlyAssigned) {
          // Find assignment ID — we need to fetch it. Use the bulk-assign remove approach.
          const res = await fetch(
            `/api/admin/assessments/${assessmentId}/controls/remove`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ controlIds: [controlId] }),
            }
          );
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to remove");
          }
        } else {
          const res = await fetch(
            `/api/admin/assessments/${assessmentId}/controls`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ controlIds: [controlId] }),
            }
          );
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to assign");
          }
        }
        // Update local state
        setAssignedIds((prev) => {
          const next = new Set(prev);
          if (currentlyAssigned) {
            next.delete(controlId);
          } else {
            next.add(controlId);
          }
          return next;
        });
      } catch (e: any) {
        showToast(e.message || "Toggle failed", "error");
      } finally {
        setSaving(false);
      }
    },
    [assessmentId, assignedIds]
  );

  // ── Local state for conclusions & effectiveness (instant UI) ────────

  const [conclusions, setConclusions] = useState<Record<number, { conclusion: string; narrative: string | null; lastAssessedDate: string | null }>>({});
  const [effectiveness, setEffectiveness] = useState<Record<string, { effective: string | null; updatedAt: string | null; testNotes: string | null; testMethod: string | null }>>({});

  // Sync from fetched data
  useEffect(() => {
    if (treeData) {
      setConclusions(treeData.requirementConclusions ?? {});
      setEffectiveness(treeData.controlEffectiveness ?? {});
    }
  }, [treeData]);

  // Update requirement conclusion via API
  const updateConclusion = useCallback(
    async (requirementRId: number, conclusion: string) => {
      // Optimistic update
      setConclusions((prev) => ({
        ...prev,
        [requirementRId]: { conclusion, narrative: prev[requirementRId]?.narrative ?? null, lastAssessedDate: new Date().toISOString() },
      }));
      try {
        await fetch(`/api/admin/assessments/${assessmentId}/requirement-conclusions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirementRId, conclusion, lastAssessedDate: new Date().toISOString() }),
        });
      } catch {
        showToast("Failed to save conclusion", "error");
      }
    },
    [assessmentId]
  );

  // Update control effectiveness / test data via API
  const updateEffectiveness = useCallback(
    async (controlId: string, updates: { effective?: string; testNotes?: string; testMethod?: string }) => {
      // Optimistic update
      setEffectiveness((prev) => ({
        ...prev,
        [controlId]: {
          effective: updates.effective !== undefined ? updates.effective : prev[controlId]?.effective ?? null,
          updatedAt: new Date().toISOString(),
          testNotes: updates.testNotes !== undefined ? updates.testNotes : prev[controlId]?.testNotes ?? null,
          testMethod: updates.testMethod !== undefined ? updates.testMethod : prev[controlId]?.testMethod ?? null,
        },
      }));
      try {
        await fetch(`/api/admin/assessments/${assessmentId}/control-effectiveness`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controlId, ...updates }),
        });
      } catch {
        showToast("Failed to save", "error");
      }
    },
    [assessmentId]
  );

  // ── Cascade helpers ─────────────────────────────────────────────────

  // Get all control IDs under a requirement
  const getReqControlIds = useCallback(
    (std: string, pa: string, reqId: number): string[] => {
      if (!treeData) return [];
      for (const s of treeData.standards) {
        if (s.standard !== std) continue;
        for (const paNode of s.processAreas) {
          if (paNode.name !== pa) continue;
          for (const r of paNode.requirements) {
            if (r.rId !== reqId) continue;
            return r.controls.map((c) => c.id);
          }
        }
      }
      return [];
    },
    [treeData]
  );

  // Check if all controls under a requirement are assigned
  const isReqFullyAssigned = useCallback(
    (std: string, pa: string, reqId: number): boolean => {
      const ids = getReqControlIds(std, pa, reqId);
      if (ids.length === 0) return false;
      return ids.every((id) => assignedIds.has(id));
    },
    [getReqControlIds, assignedIds]
  );

  // Check if some (but not all) controls under a requirement are assigned
  const isReqPartiallyAssigned = useCallback(
    (std: string, pa: string, reqId: number): boolean => {
      const ids = getReqControlIds(std, pa, reqId);
      if (ids.length === 0) return false;
      const some = ids.some((id) => assignedIds.has(id));
      const all = ids.every((id) => assignedIds.has(id));
      return some && !all;
    },
    [getReqControlIds, assignedIds]
  );

  // Toggle all controls under a requirement
  const toggleRequirement = useCallback(
    async (std: string, pa: string, reqId: number) => {
      const ids = getReqControlIds(std, pa, reqId);
      if (ids.length === 0) return;
      const allAssigned = ids.every((id) => assignedIds.has(id));
      // If all assigned → unassign all; otherwise → assign all unassigned
      const toToggle = allAssigned
        ? ids.filter((id) => assignedIds.has(id))
        : ids.filter((id) => !assignedIds.has(id));

      if (toToggle.length === 0) return;
      setSaving(true);
      try {
        if (allAssigned) {
          // Remove all
          const res = await fetch(
            `/api/admin/assessments/${assessmentId}/controls/remove`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ controlIds: toToggle }),
            }
          );
          if (!res.ok) throw new Error("Failed to remove");
          setAssignedIds((prev) => {
            const next = new Set(prev);
            toToggle.forEach((id) => next.delete(id));
            return next;
          });
        } else {
          // Assign unassigned
          const res = await fetch(
            `/api/admin/assessments/${assessmentId}/controls`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ controlIds: toToggle }),
            }
          );
          if (!res.ok) throw new Error("Failed to assign");
          setAssignedIds((prev) => {
            const next = new Set(prev);
            toToggle.forEach((id) => next.add(id));
            return next;
          });
        }
      } catch (e: any) {
        showToast(e.message || "Toggle failed", "error");
      } finally {
        setSaving(false);
      }
    },
    [getReqControlIds, assignedIds, assessmentId]
  );

  // Handle control checkbox click — cascade to parent requirement
  const handleControlToggle = useCallback(
    (controlId: string, std: string, pa: string, reqId: number) => {
      // Check if this control appears in other requirements
      const locs = treeData?.controlLocations?.[controlId] ?? [];
      const otherLocs = locs.filter(
        (l) => l.requirementId !== getRequirementId(std, pa, reqId)
      );

      if (otherLocs.length > 0 && !assignedIds.has(controlId)) {
        // Show popup about other locations when assigning (not when removing)
        const locList = otherLocs
          .map((l) => `  • ${l.processAreaName} → ${l.requirementId}`)
          .join("\n");
        showToast(
          `ℹ️ "${controlId.slice(-8)}" also exists in:\n${locList}\n\nThose requirements are NOT auto-checked.`,
          "info"
        );
      }

      toggleControl(controlId);
    },
    [treeData, assignedIds, toggleControl]
  );

  // Helper: get requirementId string from rId
  const getRequirementId = (std: string, pa: string, reqId: number): string => {
    if (!treeData) return "";
    for (const s of treeData.standards) {
      if (s.standard !== std) continue;
      for (const paNode of s.processAreas) {
        if (paNode.name !== pa) continue;
        for (const r of paNode.requirements) {
          if (r.rId === reqId) return r.requirementId;
        }
      }
    }
    return "";
  };

  // ── Expand / collapse ───────────────────────────────────────────────

  const toggleExpand = (key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Filter logic ────────────────────────────────────────────────────

  const filteredTree = useMemo(() => {
    if (!treeData) return null;
    if (!filter.trim()) return treeData;

    const term = filter.toLowerCase();

    const filterControls = (controls: TreeControl[]) =>
      controls.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.controlType.toLowerCase().includes(term)
      );

    const filterRequirements = (reqs: TreeRequirement[]) =>
      reqs
        .map((r) => ({
          ...r,
          controls: filterControls(r.controls),
        }))
        .filter(
          (r) =>
            r.requirementId.toLowerCase().includes(term) ||
            r.clauseContent.toLowerCase().includes(term) ||
            r.controls.length > 0
        );

    const filterProcessAreas = (pas: TreeProcessArea[]) =>
      pas
        .map((pa) => ({
          ...pa,
          requirements: filterRequirements(pa.requirements),
        }))
        .filter((pa) => pa.requirements.length > 0);

    const filterStandards = (stds: TreeStandard[]) =>
      stds
        .map((s) => ({
          ...s,
          processAreas: filterProcessAreas(s.processAreas),
        }))
        .filter((s) => s.processAreas.length > 0);

    const filteredStandards = filterStandards(treeData.standards);
    const filteredUnmapped = filterControls(treeData.unmappedControls);

    return {
      ...treeData,
      standards: filteredStandards,
      unmappedControls: filteredUnmapped,
    };
  }, [treeData, filter]);

  // ── Derived: selected (assigned) controls grouped by PA → Requirement ─

  const selectedAssignments = useMemo(() => {
    if (!treeData) return [];
    interface SelectedControl {
      controlId: string;
      controlName: string;
      controlType: string;
      requirementId: string;
      requirementRId: number;
    }
    interface SelectedReq {
      requirementId: string;
      rId: number;
      controls: SelectedControl[];
    }
    interface SelectedPA {
      processAreaName: string;
      requirements: SelectedReq[];
    }
    const paMap = new Map<string, SelectedPA>();

    for (const std of treeData.standards) {
      for (const pa of std.processAreas) {
        for (const req of pa.requirements) {
          const assigned = req.controls.filter((c) => assignedIds.has(c.id));
          if (assigned.length === 0) continue;
          if (!paMap.has(pa.name)) {
            paMap.set(pa.name, { processAreaName: pa.name, requirements: [] });
          }
          paMap.get(pa.name)!.requirements.push({
            requirementId: req.requirementId,
            rId: req.rId,
            controls: assigned.map((c) => ({
              controlId: c.id,
              controlName: c.name,
              controlType: c.controlType,
              requirementId: req.requirementId,
              requirementRId: req.rId,
            })),
          });
        }
      }
    }
    // Also collect unmapped controls that are assigned
    const assignedUnmapped = treeData.unmappedControls.filter((c) =>
      assignedIds.has(c.id)
    );
    if (assignedUnmapped.length > 0) {
      if (!paMap.has("__unmapped__")) {
        paMap.set("__unmapped__", {
          processAreaName: "Unmapped Controls",
          requirements: [],
        });
      }
      paMap.get("__unmapped__")!.requirements.push({
        requirementId: "—",
        rId: 0,
        controls: assignedUnmapped.map((c) => ({
          controlId: c.id,
          controlName: c.name,
          controlType: c.controlType,
          requirementId: "—",
          requirementRId: 0,
        })),
      });
    }

    return Array.from(paMap.values()).sort((a, b) => {
      // Unmapped always last
      if (a.processAreaName === "Unmapped Controls") return 1;
      if (b.processAreaName === "Unmapped Controls") return -1;
      return a.processAreaName.localeCompare(b.processAreaName);
    });
  }, [treeData, assignedIds]);

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-3 text-sm text-slate-500">
          Loading control tree…
        </span>
      </div>
    );
  }

  if (!filteredTree) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        Failed to load controls.
      </p>
    );
  }

  const tree = filteredTree;

  return (
    <div className="space-y-3">
      {/* Filter */}
      <input
        type="text"
        placeholder="Filter requirements or controls…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
      />

      {/* Assigned count */}
      <div className="text-xs text-slate-500">
        {assignedIds.size} control{assignedIds.size !== 1 ? "s" : ""} assigned
        {filter && ` (filtered)`}
      </div>

      {/* Tree */}
      <div className="max-h-[65vh] overflow-y-auto rounded border border-slate-200">
        {tree.standards.length === 0 &&
        tree.unmappedControls.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-400">
            {filter
              ? "No matches for your filter."
              : "No requirements or controls found."}
          </p>
        ) : (
          <div>
            {/* Standards */}
            {tree.standards.map((std) => {
              const stdKey = `std:${std.standard}`;
              const isStdOpen = expandedNodes.has(stdKey);
              // Count total controls and assigned under this standard
              let stdTotal = 0;
              let stdAssigned = 0;
              for (const pa of std.processAreas) {
                for (const r of pa.requirements) {
                  stdTotal += r.controls.length;
                  stdAssigned += r.controls.filter((c) =>
                    assignedIds.has(c.id)
                  ).length;
                }
              }

              return (
                <div key={stdKey} className="border-b border-slate-100 last:border-b-0">
                  {/* Standard header */}
                  <button
                    onClick={() => toggleExpand(stdKey)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left sticky top-0"
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      {std.standard}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {stdAssigned > 0 && (
                        <span className="text-blue-600 font-medium">
                          {stdAssigned} assigned
                        </span>
                      )}
                      <span>
                        {isStdOpen ? "▼" : "▶"} {stdTotal}
                      </span>
                    </span>
                  </button>

                  {isStdOpen && (
                    <div>
                      {/* Process Areas */}
                      {std.processAreas.map((pa) => {
                        const paKey = `pa:${std.standard}:${pa.name}`;
                        const isPaOpen = expandedNodes.has(paKey);
                        let paTotal = 0;
                        let paAssigned = 0;
                        for (const r of pa.requirements) {
                          paTotal += r.controls.length;
                          paAssigned += r.controls.filter((c) =>
                            assignedIds.has(c.id)
                          ).length;
                        }

                        return (
                          <div key={paKey} className="border-t border-slate-50">
                            {/* PA header */}
                            <button
                              onClick={() => toggleExpand(paKey)}
                              className="w-full flex items-center justify-between px-5 py-1.5 hover:bg-slate-50 transition-colors text-left"
                            >
                              <span className="text-xs font-medium text-slate-700">
                                {pa.name}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-slate-400">
                                {paAssigned > 0 && (
                                  <span className="text-blue-500">
                                    {paAssigned} assigned
                                  </span>
                                )}
                                <span>
                                  {isPaOpen ? "▼" : "▶"} {paTotal}
                                </span>
                              </span>
                            </button>

                            {isPaOpen && (
                              <div className="border-l-2 border-blue-100 ml-8">
                                {/* Requirements */}
                                {pa.requirements.map((req) => {
                                  const reqKey = `req:${std.standard}:${pa.name}:${req.rId}`;
                                  const isReqOpen = expandedNodes.has(reqKey);
                                  const allAssigned = req.controls.every((c) =>
                                    assignedIds.has(c.id)
                                  );
                                  const someAssigned = req.controls.some((c) =>
                                    assignedIds.has(c.id)
                                  );
                                  const partial = someAssigned && !allAssigned;

                                  return (
                                    <div key={reqKey}>
                                      {/* Requirement row — WITH checkbox */}
                                      <div className="flex items-center border-b border-slate-50">
                                        <button
                                          onClick={() => toggleExpand(reqKey)}
                                          className="flex-1 flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50 transition-colors text-left min-w-0"
                                        >
                                          {/* Requirement-level checkbox */}
                                          {req.controls.length > 0 ? (
                                            <input
                                              type="checkbox"
                                              checked={allAssigned}
                                              ref={(el) => {
                                                if (el) el.indeterminate = partial;
                                              }}
                                              onChange={() =>
                                                toggleRequirement(
                                                  std.standard,
                                                  pa.name,
                                                  req.rId
                                                )
                                              }
                                              disabled={saving}
                                              onClick={(e) => e.stopPropagation()}
                                              className="rounded text-blue-600 shrink-0 h-3.5 w-3.5"
                                            />
                                          ) : (
                                            <span className="w-3.5 shrink-0" />
                                          )}
                                          <span className="text-xs text-slate-600 truncate">
                                            <span className="font-mono font-medium text-slate-700">
                                              {req.requirementId}
                                            </span>
                                            {req.clauseContent && (
                                              <span className="ml-1 text-slate-400">
                                                —{" "}
                                                {req.clauseContent.substring(
                                                  0,
                                                  80
                                                )}
                                              </span>
                                            )}
                                          </span>
                                        </button>
                                        <span className="text-[10px] text-slate-400 mr-2 shrink-0">
                                          {req.controls.length > 0 &&
                                            (isReqOpen ? "▼" : "▶")}{" "}
                                          {req.controls.length}
                                        </span>
                                        {/* Requirement Conclusion */}
                                        <select
                                          value={conclusions[req.rId]?.conclusion ?? ""}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            if (e.target.value) updateConclusion(req.rId, e.target.value);
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-[10px] rounded border border-slate-200 px-1 py-0.5 shrink-0 mr-1 bg-white hover:border-blue-300 focus:border-blue-400 focus:outline-none"
                                        >
                                          <option value="">—</option>
                                          <option value="FullyMet">✓ Met</option>
                                          <option value="PartiallyMet">~ Partial</option>
                                          <option value="NotMet">✗ Not Met</option>
                                        </select>
                                        {conclusions[req.rId]?.lastAssessedDate && (
                                          <span className="text-[9px] text-slate-400 shrink-0 mr-1" suppressHydrationWarning>
                                            {new Date(conclusions[req.rId].lastAssessedDate!).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                          </span>
                                        )}
                                        {/* ＋ Finding from requirement */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onCreateFinding?.({ requirementRId: req.rId, requirementId: req.requirementId });
                                          }}
                                          className="shrink-0 rounded-full px-1 text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors mr-1"
                                          title="Raise Finding for this requirement"
                                        >
                                          ＋
                                        </button>
                                      </div>

                                      {/* Controls under this requirement */}
                                      {isReqOpen && req.controls.length > 0 && (
                                        <div className="ml-6 border-l border-slate-100">
                                          {req.controls.map((ctrl) => {
                                            const checked = assignedIds.has(
                                              ctrl.id
                                            );
                                            // Check if this control appears in other requirements
                                            const locs =
                                              treeData?.controlLocations?.[
                                                ctrl.id
                                              ] ?? [];
                                            const otherLocs = locs.filter(
                                              (l) =>
                                                l.requirementId !==
                                                  req.requirementId ||
                                                l.processAreaName !== pa.name
                                            );
                                            const hasOtherLocs =
                                              otherLocs.length > 0;

                                            return (
                                              <label
                                                key={ctrl.id}
                                                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-blue-50 transition-colors text-xs ${
                                                  checked
                                                    ? "bg-blue-50 border-l-2 border-blue-400"
                                                    : ""
                                                }`}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={checked}
                                                  onChange={() =>
                                                    handleControlToggle(
                                                      ctrl.id,
                                                      std.standard,
                                                      pa.name,
                                                      req.rId
                                                    )
                                                  }
                                                  disabled={saving}
                                                  className="rounded text-blue-600 shrink-0 h-3.5 w-3.5"
                                                />
                                                <span className="flex-1 truncate">
                                                  {ctrl.name}
                                                </span>
                                                <span className="text-[10px] text-slate-400 shrink-0">
                                                  {ctrl.controlType}
                                                </span>
                                                {hasOtherLocs && (
                                                  <span
                                                    className="text-[10px] text-amber-500 shrink-0 cursor-help"
                                                    title={`Also in: ${otherLocs
                                                      .map(
                                                        (l) =>
                                                          `${l.processAreaName} → ${l.requirementId}`
                                                      )
                                                      .join(", ")}`}
                                                  >
                                                    🔗{otherLocs.length}
                                                  </span>
                                                )}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* Empty requirement (no controls) */}
                                      {isReqOpen && req.controls.length === 0 && (
                                        <div className="ml-6 px-3 py-1.5 text-[11px] text-slate-400 italic">
                                          No controls mapped —{" "}
                                          <span className="text-amber-500">
                                            gap
                                          </span>
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
            })}

            {/* Unmapped controls (no requirement) */}
            {tree.unmappedControls.length > 0 && (
              <div className="border-t-2 border-slate-200">
                <div className="px-3 py-1.5 bg-slate-100 text-[10px] font-medium text-slate-500 uppercase">
                  Unmapped Controls
                </div>
                {tree.unmappedControls.map((ctrl) => (
                  <label
                    key={ctrl.id}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-blue-50 transition-colors text-xs ${
                      assignedIds.has(ctrl.id)
                        ? "bg-blue-50 border-l-2 border-blue-400"
                        : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={assignedIds.has(ctrl.id)}
                      onChange={() => toggleControl(ctrl.id)}
                      disabled={saving}
                      className="rounded text-blue-600 shrink-0 h-3.5 w-3.5"
                    />
                    <span className="flex-1 truncate">{ctrl.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {ctrl.controlType}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Selected Assignments ── */}
      {selectedAssignments.length > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50/50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-blue-100">
            <span className="text-xs font-semibold text-blue-800">
              📋 Selected Assignments
            </span>
            <span className="text-xs text-blue-500">
              {assignedIds.size} control{assignedIds.size !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="max-h-[40vh] overflow-y-auto">
            {selectedAssignments.map((pa) => {
              const paKey = `sel-pa:${pa.processAreaName}`;
              const paTotal = pa.requirements.reduce(
                (s, r) => s + r.controls.length,
                0
              );
              return (
                <div
                  key={paKey}
                  className="border-b border-blue-100 last:border-b-0"
                >
                  {/* PA header */}
                  <button
                    onClick={() => toggleExpand(paKey)}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-blue-100/50 transition-colors text-left"
                  >
                    <span className="text-xs font-medium text-blue-700">
                      {pa.processAreaName}
                    </span>
                    <span className="text-[10px] text-blue-400">
                      {expandedNodes.has(paKey) ? "▼" : "▶"} {paTotal}
                    </span>
                  </button>
                  {expandedNodes.has(paKey) && (
                    <div className="border-l-2 border-blue-200 ml-4">
                      {pa.requirements.map((req) => (
                        <div key={`sel-req:${req.rId}`}>
                          <div className="px-3 py-1 text-[10px] font-mono font-medium text-blue-500 bg-blue-100/30">
                            {req.requirementId}
                          </div>
                          {req.controls.map((ctrl) => (
                            <div key={`sel-ctrl:${ctrl.controlId}`}>
                              <div
                                className="flex items-center gap-2 px-4 py-1.5 hover:bg-blue-50 transition-colors text-xs"
                              >
                              <span className="flex-1 truncate text-slate-700">
                                {ctrl.controlName}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {ctrl.controlType}
                              </span>
                              {/* Effectiveness dropdown */}
                              <select
                                value={effectiveness[ctrl.controlId]?.effective ?? ""}
                                onChange={(e) => {
                                  if (e.target.value) updateEffectiveness(ctrl.controlId, { effective: e.target.value });
                                }}
                                className="text-[10px] rounded border border-slate-200 px-1 py-0.5 shrink-0 bg-white hover:border-blue-300 focus:border-blue-400 focus:outline-none"
                              >
                                <option value="">—</option>
                                <option value="Effective">Effective</option>
                                <option value="NotEffective">Not Effective</option>
                              </select>
                              {/* Test method */}
                              <select
                                value={effectiveness[ctrl.controlId]?.testMethod ?? ""}
                                onChange={(e) => updateEffectiveness(ctrl.controlId, { testMethod: e.target.value || "" })}
                                className="text-[10px] rounded border border-slate-200 px-1 py-0.5 shrink-0 bg-white hover:border-blue-300 focus:border-blue-400 focus:outline-none"
                                title="Test method"
                              >
                                <option value="">🔬</option>
                                <option value="Document Review">📄 Review</option>
                                <option value="Interview">🎙 Interview</option>
                                <option value="Observation">👁 Observe</option>
                                <option value="Sample">🧪 Sample</option>
                                <option value="Walkthrough">🚶 Walk</option>
                              </select>
                              {/* ＋ Finding */}
                              <button
                                onClick={() => onCreateFinding?.({ requirementRId: req.rId, requirementId: req.requirementId, controlId: ctrl.controlId, controlName: ctrl.controlName })}
                                className="shrink-0 rounded-full px-1 text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Raise Finding"
                              >
                                ＋
                              </button>
                              <button
                                onClick={() => toggleControl(ctrl.controlId)}
                                disabled={saving}
                                className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
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
          </div>
      )}
    </div>
  );
}
