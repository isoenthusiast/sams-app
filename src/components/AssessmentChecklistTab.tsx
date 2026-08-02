"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { AttachmentList } from "@/components/AttachmentList";
import { VoiceInput } from "@/components/VoiceInput";

interface ChecklistItem {
  id: string;
  checklistItemId: string;
  checklistText: string;
  auditStandard: string;
  templateId?: string | null;
  complianceStatus: string;
  auditorNotes: string | null;
  testedDate: string | null;
  testedBy: string | null;
  evidenceMethod: string | null;
  sortOrder: number;
  keyQuestions?: string | null;
  whatGoodLooksLike?: string | null;
  controlPoints?: string | null;
  evidenceRequirements?: string | null;
  mappedControls: Array<{
    mappingId: string;
    requirementId: string;
    requirementText: string;
    requirementClause?: string;
    requirementRId: number;
    controlId: string;
    controlName: string;
    controlType: string;
    sourceFile: string;
  }>;
}

const STATUS_OPTIONS = [
  { value: "NotTested", label: "Not Tested", color: "bg-slate-200 text-slate-700" },
  { value: "Compliant", label: "Compliant", color: "bg-emerald-100 text-emerald-800" },
  { value: "NonCompliant", label: "Non-Compliant", color: "bg-red-100 text-red-800" },
  { value: "NotApplicable", label: "N/A", color: "bg-slate-100 text-slate-500" },
  { value: "Observation", label: "Observation", color: "bg-amber-100 text-amber-800" },
];

export function AssessmentChecklistTab({
  assessmentId,
  onAddFinding,
}: {
  assessmentId: string;
  onAddFinding?: (checklistItemId: string, itemText: string) => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [expandedMappings, setExpandedMappings] = useState<Set<string>>(new Set());
  // Control mapping state
  const [mappingTarget, setMappingTarget] = useState<{ itemId: string; requirementRId: number; requirementId: string; auditStandard: string } | null>(null);
  const [availableControls, setAvailableControls] = useState<any[]>([]);
  const [controlSearch, setControlSearch] = useState("");
  const [loadingControls, setLoadingControls] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/assessments/${assessmentId}/checklist`)
      .then((r) => r.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [assessmentId]);

  const updateStatus = async (itemId: string, status: string, itemText?: string) => {
    setSaving(itemId);
    await fetch(`/api/admin/assessments/${assessmentId}/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complianceStatus: status }),
    });
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, complianceStatus: status } : i))
    );
    setSaving(null);

    // T5.4: Auto-prompt finding when status set to NonCompliant
    if (status === "NonCompliant" && onAddFinding) {
      const item = items.find((i) => i.id === itemId);
      if (item) {
        setTimeout(() => onAddFinding(item.id, item.checklistText), 300);
      }
    }
  };

  const saveNotes = async (itemId: string) => {
    setSaving(itemId);
    await fetch(`/api/admin/assessments/${assessmentId}/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditorNotes: notesDraft }),
    });
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, auditorNotes: notesDraft } : i))
    );
    setEditingNotes(null);
    setSaving(null);
  };

  const startEditNotes = (item: ChecklistItem) => {
    setEditingNotes(item.id);
    setNotesDraft(item.auditorNotes ?? "");
  };

  if (loading) return <p className="text-sm text-slate-400 py-4">Loading checklist…</p>;
  if (items.length === 0)
    return (
      <p className="text-sm text-slate-400 py-4">
        No checklist adopted yet. Use the &ldquo;Adopt Checklist&rdquo; option.
      </p>
    );

  // Get unique template IDs for removal
  const templateIds = [...new Set(items.map(i => i.templateId).filter(Boolean))] as string[];

  const handleRemoveChecklist = async (templateId: string) => {
    if (!confirm("Remove all checklist items from this template? This cannot be undone.")) return;
    await fetch(`/api/admin/assessments/${assessmentId}/adopt-checklist?templateId=${templateId}`, { method: "DELETE" });
    reloadChecklist();
  };

  const reloadChecklist = async () => {
    const r = await fetch(`/api/admin/assessments/${assessmentId}/checklist`);
    const d = await r.json();
    setItems(Array.isArray(d) ? d : []);
  };

  // Open control mapping modal
  const openControlMapping = async (item: ChecklistItem, reqRId: number, reqId: string) => {
    setMappingTarget({ itemId: item.id, requirementRId: reqRId, requirementId: reqId, auditStandard: item.auditStandard });
    setControlSearch("");
    setLoadingControls(true);
    try {
      const r = await fetch(`/api/admin/assessments/${assessmentId}/controls`);
      const d = await r.json();
      setAvailableControls(Array.isArray(d) ? d : []);
    } catch { setAvailableControls([]); }
    setLoadingControls(false);
  };

  // Link a control to a requirement
  const handleLinkControl = async (controlId: string) => {
    if (!mappingTarget) return;
    const item = items.find(i => i.id === mappingTarget.itemId);
    if (!item) return;
    await fetch(`/api/admin/assessments/${assessmentId}/checklist-requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklistItemId: item.checklistItemId,
        requirementRId: mappingTarget.requirementRId,
        controlId,
        auditStandard: mappingTarget.auditStandard,
      }),
    });
    setMappingTarget(null);
    reloadChecklist();
  };

  // Unlink a control from a requirement
  const handleUnlinkControl = async (mappingId: string) => {
    if (!confirm("Remove this control from the requirement?")) return;
    await fetch(`/api/admin/assessments/${assessmentId}/checklist-requirements?mappingId=${mappingId}`, { method: "DELETE" });
    reloadChecklist();
  };

  // Group by auditStandard
  const grouped = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const key = item.auditStandard;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <div className="space-y-6">
      {/* Remove Checklist button */}
      {templateIds.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{items.length} checklist items</span>
          {templateIds.map(tid => (
            <button
              key={tid}
              onClick={() => handleRemoveChecklist(tid)}
              className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50"
            >
              🗑 Remove Checklist
            </button>
          ))}
        </div>
      )}
      {Array.from(grouped.entries()).map(([std, stdItems]) => (
        <div key={std}>
          <h4 className="text-sm font-semibold text-slate-800 mb-2">{std}</h4>
          <div className="space-y-1">
            {stdItems.map((item) => {
              const st = STATUS_OPTIONS.find((s) => s.value === item.complianceStatus) ?? STATUS_OPTIONS[0];
              return (
                <div
                  key={item.id}
                  className="rounded-md border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-slate-400">{item.checklistItemId}</span>
                        <span className="text-sm text-slate-800">{item.checklistText}</span>
                      </div>
                      {/* v1.10.10: Requirement containers with clause text + mapped controls */}
                      {item.mappedControls.length > 0 && (() => {
                        // Group controls under their requirement
                        const byReq = new Map<string, { clause: string; controls: typeof item.mappedControls }>();
                        for (const mc of item.mappedControls) {
                          const key = mc.requirementId;
                          if (!byReq.has(key)) {
                            byReq.set(key, { clause: mc.requirementClause || mc.requirementText, controls: [] });
                          }
                          byReq.get(key)!.controls.push(mc);
                        }
                        const reqEntries = Array.from(byReq.entries());
                        const isExpanded = expandedMappings.has(item.id);
                        const displayEntries = isExpanded ? reqEntries : reqEntries.slice(0, 2);

                        return (
                          <div className="mt-2 space-y-2">
                            {displayEntries.map(([reqId, { clause, controls }]) => (
                              <details key={reqId} className="group border border-slate-200 rounded-md overflow-hidden">
                                <summary className="flex items-center gap-2 px-3 py-2 bg-slate-50 cursor-pointer hover:bg-slate-100 text-xs">
                                  <span className="font-mono font-semibold text-blue-700">{reqId}</span>
                                  <span className="text-slate-400">—</span>
                                  <span className="text-slate-600 truncate">{clause.substring(0, 100)}</span>
                                  <span className="text-slate-300 ml-auto text-[10px]">{controls.filter(c => c.controlId).length} controls</span>
                                </summary>
                                <div className="px-3 py-2 border-t border-slate-100">
                                  {controls.filter(c => c.controlId).length === 0 ? (
                                    <p className="text-xs text-slate-400 italic mb-2">No controls linked yet.</p>
                                  ) : (
                                    <div className="space-y-1 mb-2">
                                      {controls.filter(c => c.controlId).map((mc, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-slate-600 py-0.5 group">
                                          <span className="text-emerald-500 shrink-0">●</span>
                                          <span className="truncate flex-1">{mc.controlName}</span>
                                          <span className="text-slate-300 text-[10px] shrink-0">{mc.controlType}</span>
                                          {mc.mappingId && (
                                            <button
                                              onClick={(e) => { e.preventDefault(); handleUnlinkControl(mc.mappingId); }}
                                              className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                              title="Remove control"
                                            >×</button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Find the requirementRId from the first control */}
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const firstCtrl = controls[0];
                                      if (firstCtrl?.requirementRId) {
                                        const checklistItem = items.find(ci =>
                                          ci.mappedControls.some(mc => mc.requirementRId === firstCtrl.requirementRId));
                                        if (checklistItem) openControlMapping(checklistItem, firstCtrl.requirementRId, reqId);
                                      }
                                    }}
                                    className="text-[10px] text-blue-500 hover:text-blue-700"
                                  >
                                    ＋ Add Control
                                  </button>
                                </div>
                              </details>
                            ))}
                            {reqEntries.length > 2 && (
                              <button
                                onClick={() => setExpandedMappings(prev => {
                                  const next = new Set(prev);
                                  next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                  return next;
                                })}
                                className="text-[10px] text-blue-500 hover:text-blue-700"
                              >
                                {isExpanded ? "▲ Show less" : `＋ ${reqEntries.length - 2} more requirements`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      {item.auditorNotes && editingNotes !== item.id && (
                        <p className="text-xs text-slate-500 mt-1 italic">
                          📝 {item.auditorNotes}
                          <button onClick={() => startEditNotes(item)} className="ml-1 text-blue-500 hover:text-blue-700 text-[10px]">✏️</button>
                        </p>
                      )}
                      {/* T5.2: Inline notes editor with voice input */}
                      {editingNotes === item.id && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-start gap-2">
                            <textarea
                              value={notesDraft}
                              onChange={(e) => setNotesDraft(e.target.value)}
                              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                              rows={2}
                              placeholder="Auditor notes..."
                              autoFocus
                            />
                            <VoiceInput onResult={(t: string) => setNotesDraft((prev) => prev + " " + t)} />
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => saveNotes(item.id)}
                              className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700">
                              Save
                            </button>
                            <button onClick={() => setEditingNotes(null)}
                              className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {!item.auditorNotes && editingNotes !== item.id && (
                        <button onClick={() => startEditNotes(item)}
                          className="text-[10px] text-slate-400 hover:text-blue-500 mt-1">
                          ＋ Add notes
                        </button>
                      )}
                      {/* v1.10.9: Rich content — expandable details */}
                      <button
                        onClick={() => {
                          setExpandedDetails(prev => {
                            const next = new Set(prev);
                            next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                            return next;
                          });
                        }}
                        className="text-[10px] text-slate-400 hover:text-blue-500 mt-1"
                      >
                        {expandedDetails.has(item.id) ? "▲ Hide Details" : "📋 Show Details"}
                      </button>
                      {expandedDetails.has(item.id) && (
                        <div className="mt-2 pl-2 border-l-2 border-blue-200 space-y-2">
                          {item.keyQuestions && (
                            <div>
                              <p className="text-[10px] font-medium text-slate-500">🔍 Key Questions</p>
                              <p className="text-xs text-slate-600">{item.keyQuestions}</p>
                            </div>
                          )}
                          {item.whatGoodLooksLike && (
                            <div>
                              <p className="text-[10px] font-medium text-slate-500">✅ What Good Looks Like</p>
                              <p className="text-xs text-slate-600">{item.whatGoodLooksLike}</p>
                            </div>
                          )}
                          {item.controlPoints && (
                            <div>
                              <p className="text-[10px] font-medium text-slate-500">🎯 Control Points</p>
                              <p className="text-xs text-slate-600">{item.controlPoints}</p>
                            </div>
                          )}
                          {item.evidenceRequirements && (
                            <div>
                              <p className="text-[10px] font-medium text-slate-500">📎 Evidence Requirements</p>
                              <p className="text-xs text-slate-600">{item.evidenceRequirements}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {/* T2.2: Evidence attachments per checklist item */}
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <AttachmentList destTable="AuditChecklistItem" recId={item.id} />
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {/* T5.1: Quick-add finding from checklist item */}
                      {onAddFinding && (
                        <button
                          onClick={() => onAddFinding(item.id, item.checklistText)}
                          className="text-[10px] text-blue-500 hover:text-blue-700 font-medium px-1"
                          title="Create finding from this checklist item"
                        >
                          ＋ Finding
                        </button>
                      )}
                      <select
                        value={item.complianceStatus}
                        onChange={(e) => updateStatus(item.id, e.target.value, item.checklistText)}
                        disabled={saving === item.id}
                        className={`text-xs rounded px-2 py-1 border ${st.color}`}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {/* Control Mapping Modal */}
      {mappingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMappingTarget(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">🔗 Add Control to Requirement</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {mappingTarget.requirementId}
                </p>
              </div>
              <button onClick={() => setMappingTarget(null)} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 shrink-0">
              <input
                type="text" value={controlSearch} onChange={e => setControlSearch(e.target.value)}
                placeholder="Search controls by name or process area..."
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {loadingControls ? (
                <p className="text-sm text-slate-400 py-4 text-center">Loading controls…</p>
              ) : (
                <div className="space-y-1">
                  {availableControls
                    .filter((c: any) => !controlSearch || c.name?.toLowerCase().includes(controlSearch.toLowerCase()) || c.processArea?.name?.toLowerCase().includes(controlSearch.toLowerCase()))
                    .slice(0, 50)
                    .map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => handleLinkControl(c.id)}
                        className="w-full text-left flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-blue-50 transition-colors"
                      >
                        <span className="text-blue-400 shrink-0">＋</span>
                        <span className="font-medium text-slate-700 truncate flex-1">{c.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{c.controlType}</span>
                        {c.processArea?.name && (
                          <span className="text-xs text-slate-300 truncate max-w-[120px] shrink-0">{c.processArea.name}</span>
                        )}
                      </button>
                    ))}
                  {availableControls.length === 0 && (
                    <p className="text-sm text-slate-400 py-4 text-center">No controls available. Assign controls to this assessment first.</p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-200 shrink-0 flex justify-end">
              <button onClick={() => setMappingTarget(null)}
                className="rounded bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
