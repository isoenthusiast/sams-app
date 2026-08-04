"use client";

import { useState, useMemo } from "react";

type ControlNode = {
  id: string;
  name: string;
  controlType: string;
  homePaId: string;
};

type RequirementNode = {
  rId: number;
  requirementId: string;
  clauseContent: string | null;
  controls: ControlNode[];
};

type ProcessAreaNode = {
  id: string;
  name: string;
  requirements: RequirementNode[];
};

type StandardNode = {
  standard: string;
  isIso: boolean;
  processAreas: ProcessAreaNode[];
};

export type { StandardNode };

type Props = {
  standards: StandardNode[];
  /** IDs of controls already in the Unmapped section */
  unmappedIds: Set<string>;
  /** IDs of controls already mapped to a requirement in the current PA */
  alreadyMappedIds?: Set<string>;
  /** Called when user clicks a control to add/remove it from Unmapped */
  onToggleControl: (controlId: string) => void;
  currentPaName?: string;
};

export function ControlTree({ standards, unmappedIds, alreadyMappedIds = new Set(), onToggleControl, currentPaName }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter tree by control name
  const filteredStandards = useMemo(() => {
    if (!filter.trim()) return standards;
    const term = filter.toLowerCase();
    return standards
      .map((std) => ({
        ...std,
        processAreas: std.processAreas
          .map((pa) => ({
            ...pa,
            requirements: pa.requirements
              .map((req) => ({
                ...req,
                controls: req.controls.filter(
                  (c) => c.name.toLowerCase().includes(term) || c.controlType?.toLowerCase().includes(term)
                ),
              }))
              .filter((req) => req.controls.length > 0),
          }))
          .filter((pa) => pa.requirements.length > 0),
      }))
      .filter((std) => std.processAreas.length > 0);
  }, [standards, filter]);

  if (standards.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">No controls available for this company.</p>;
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Search controls..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mb-2"
      />

      <div className="max-h-[50vh] overflow-y-auto space-y-0.5">
        {filteredStandards.map((std) => {
          const stdKey = `std:${std.standard}`;
          const isStdExpanded = expanded.has(stdKey);
          const totalControls = std.processAreas.reduce(
            (s, pa) => s + pa.requirements.reduce((s2, r) => s2 + r.controls.length, 0),
            0
          );

          return (
            <div key={stdKey} className="border border-slate-200 rounded-md overflow-hidden">
              {/* Standard level */}
              <button
                onClick={() => toggleExpand(stdKey)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {std.isIso ? "🌐" : "📁"} {std.standard}
                </span>
                <span className="text-xs text-slate-500">
                  {totalControls} {isStdExpanded ? "▲" : "▼"}
                </span>
              </button>

              {isStdExpanded && (
                <div>
                  {std.processAreas.map((pa) => {
                    const paKey = `pa:${std.standard}:${pa.id}`;
                    const isPaExpanded = expanded.has(paKey);
                    const paTotal = pa.requirements.reduce((s, r) => s + r.controls.length, 0);
                    return (
                      <div key={paKey} className="border-t border-slate-100">
                        {/* Process Area level */}
                        <button
                          onClick={() => toggleExpand(paKey)}
                          className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-slate-50 transition-colors text-left"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            {pa.name}
                            {pa.name === currentPaName && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">current</span>
                            )}
                          </span>
                          <span className="text-xs text-slate-400">
                            {paTotal} {isPaExpanded ? "▲" : "▶"}
                          </span>
                        </button>

                        {isPaExpanded && (
                          <div className="border-l-2 border-blue-200 ml-4">
                            {pa.requirements.map((req) => {
                              const reqKey = `req:${std.standard}:${pa.id}:${req.rId}`;
                              const isReqExpanded = expanded.has(reqKey);
                              const isUnmapped = req.requirementId === "__unmapped__";
                              return (
                                <div key={reqKey}>
                                  {/* Requirement level */}
                                  {!isUnmapped && (
                                    <button
                                      onClick={() => toggleExpand(reqKey)}
                                      className="w-full flex items-center justify-between px-3 py-1 hover:bg-slate-50 transition-colors text-left"
                                    >
                                      <span className="text-xs text-slate-600 truncate max-w-[70%]">
                                        {req.requirementId}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        {req.controls.length} {isReqExpanded ? "▲" : "▶"}
                                      </span>
                                    </button>
                                  )}

                                  {/* Controls level */}
                                  {isUnmapped && (
                                    <div className="px-2 py-1">
                                      <div className="text-[10px] text-slate-400 italic mb-1">Unmapped controls</div>
                                    </div>
                                  )}
                                  {((!isUnmapped && isReqExpanded) || isUnmapped) && (
                                    <div className={isUnmapped ? "ml-2" : "ml-6"}>
                                      {req.controls.map((ctrl) => {
                                        const isInUnmapped = unmappedIds.has(ctrl.id);
                                        const isAlreadyMapped = alreadyMappedIds.has(ctrl.id);
                                        const isDisabled = isAlreadyMapped && !isInUnmapped;

                                        return (
                                          <button
                                            key={ctrl.id}
                                            onClick={() => {
                                              if (isDisabled) return; // already mapped, can't add
                                              onToggleControl(ctrl.id);
                                            }}
                                            disabled={isDisabled}
                                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left
                                              ${isInUnmapped
                                                ? "bg-amber-100 border-l-2 border-amber-400 cursor-pointer hover:bg-amber-200"
                                                : isDisabled
                                                ? "bg-slate-50 text-slate-400 cursor-not-allowed"
                                                : "hover:bg-blue-50 cursor-pointer"
                                              }`}
                                            title={
                                              isDisabled
                                                ? "Already mapped to a requirement in this PA"
                                                : isInUnmapped
                                                ? "Click to remove from Unmapped"
                                                : "Click to add to Unmapped"
                                            }
                                          >
                                            <span
                                              className={`shrink-0 text-base leading-none ${
                                                isInUnmapped ? "text-amber-600" : isDisabled ? "text-slate-300" : "text-slate-300"
                                              }`}
                                            >
                                              {isInUnmapped ? "✓" : isDisabled ? "—" : "○"}
                                            </span>
                                            <span className={`flex-1 truncate ${isInUnmapped ? "text-amber-900 font-medium" : "text-slate-700"}`}>
                                              {ctrl.name}
                                            </span>
                                            <span className="text-[10px] text-slate-400 shrink-0">{ctrl.controlType}</span>
                                          </button>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
