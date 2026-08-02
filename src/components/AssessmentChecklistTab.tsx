"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { AttachmentList } from "@/components/AttachmentList";
import { VoiceInput } from "@/components/VoiceInput";

// ── Control Mapping Modal (v1.10.9) ──────────────────────────────
function ControlMappingModal({
  assessmentId, itemId, itemText, onClose,
}: {
  assessmentId: string;
  itemId: string;
  itemText: string;
  onClose: () => void;
}) {
  interface ScoredControl {
    controlId: string; controlName: string; controlStatement: string;
    controlType: string; processArea: string; score: number;
    isLinked: boolean; junctionId: string | null;
  }

  const [controls, setControls] = useState<ScoredControl[] | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    fetch(`/api/admin/assessments/${assessmentId}/checklist-controls?itemId=${itemId}`)
      .then(r => r.json()).then(d => setControls(d.controls ?? [])).catch(() => setControls([]));
  }, [assessmentId, itemId]);

  const handleLink = async (controlId: string) => {
    await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistItemId: itemId, controlId }),
    });
    const r = await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls?itemId=${itemId}`);
    const d = await r.json(); setControls(d.controls ?? []);
  };

  const handleUnlink = async (junctionId: string) => {
    await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls/${junctionId}`, { method: "DELETE" });
    const r = await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls?itemId=${itemId}`);
    const d = await r.json(); setControls(d.controls ?? []);
  };

  if (!controls) return null;

  const linked = controls.filter(c => c.isLinked);
  const suggested = controls.filter(c => !c.isLinked && c.score > 0);
  const filtered = suggested.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !s || c.controlName.toLowerCase().includes(s) || c.controlStatement.toLowerCase().includes(s) || c.processArea.toLowerCase().includes(s);
    const matchType = !filterType || c.controlType === filterType;
    return matchSearch && matchType;
  });

  const controlTypes = [...new Set(controls.map(c => c.controlType))].sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">🔗 Map Controls</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-lg">{itemText}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
        </div>

        {/* Linked Controls */}
        {linked.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-100 shrink-0">
            <p className="text-xs font-medium text-slate-500 mb-2">✓ Linked Controls ({linked.length})</p>
            <div className="space-y-1">
              {linked.map(c => (
                <div key={c.controlId} className="flex items-center justify-between text-xs bg-emerald-50 rounded px-2 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-emerald-600 shrink-0">✓</span>
                    <span className="font-medium text-slate-700 truncate">{c.controlName}</span>
                    <span className="text-slate-400 shrink-0">({c.score}%)</span>
                    <span className="text-slate-300 text-[10px] truncate hidden sm:inline">{c.processArea}</span>
                  </div>
                  <button onClick={() => handleUnlink(c.junctionId!)} className="text-red-400 hover:text-red-600 shrink-0 ml-2">&times;</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Controls */}
        <div className="px-6 py-3 flex-1 overflow-y-auto">
          <p className="text-xs font-medium text-slate-500 mb-2">
            Available Controls ({filtered.length})
          </p>

          {/* Search & Filter */}
          <div className="flex gap-2 mb-3">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search controls or process areas..."
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-xs">
              <option value="">All Types</option>
              {controlTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              {search ? "No controls match your search." : "No controls available for this checklist item."}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map(c => (
                <button
                  key={c.controlId}
                  onClick={() => handleLink(c.controlId)}
                  className="w-full text-left flex items-center gap-2 text-xs rounded px-2 py-1.5 hover:bg-blue-50 transition-colors group"
                >
                  <span className="text-blue-400 group-hover:text-blue-600 shrink-0">＋</span>
                  <span className="font-medium text-slate-700 truncate">{c.controlName}</span>
                  <span className="text-slate-400 shrink-0">({c.score}%)</span>
                  <span className="text-slate-300 text-[10px] truncate hidden sm:inline">{c.processArea}</span>
                  <span className="text-slate-300 text-[10px] shrink-0 ml-auto">{c.controlType}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 shrink-0 flex justify-between items-center">
          <span className="text-xs text-slate-400">
            {linked.length} linked · {suggested.length} suggested
          </span>
          <button onClick={onClose}
            className="rounded bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChecklistItem {
  id: string;
  checklistItemId: string;
  checklistText: string;
  auditStandard: string;
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
    requirementId: string;
    requirementText: string;
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
  const [mappingItemId, setMappingItemId] = useState<string | null>(null);

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

  // Group by auditStandard
  const grouped = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const key = item.auditStandard;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <div className="space-y-6">
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
                      {/* Mapped controls */}
                      {item.mappedControls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {item.mappedControls.slice(0, 3).map((mc, i) => (
                            <div key={i} className="text-xs text-slate-500 flex items-center gap-1">
                              <span className="font-mono text-blue-600">{mc.requirementId}</span>
                              <span>→</span>
                              <span className="truncate">{mc.controlName}</span>
                              <span className="text-slate-300">({mc.sourceFile ?? "no source"})</span>
                            </div>
                          ))}
                          {item.mappedControls.length > 3 && (
                            <span className="text-xs text-slate-400">
                              +{item.mappedControls.length - 3} more controls
                            </span>
                          )}
                        </div>
                      )}
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
                      {/* v1.10.9: Map Controls modal trigger */}
                      <button
                        onClick={() => setMappingItemId(item.id)}
                        className="text-[10px] text-purple-500 hover:text-purple-700 font-medium mt-1"
                      >
                        🔗 Map Controls
                      </button>
                      {/* v1.10.1: Linked Controls (compact inline display) */}
                      <LinkedControlsSummary assessmentId={assessmentId} itemId={item.id} />
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
      {/* v1.10.9: Control Mapping Modal */}
      {mappingItemId && (() => {
        const item = items.find(i => i.id === mappingItemId);
        return (
          <ControlMappingModal
            assessmentId={assessmentId}
            itemId={mappingItemId}
            itemText={item?.checklistText ?? ""}
            onClose={() => setMappingItemId(null)}
          />
        );
      })()}
    </div>
  );
}

// ── Compact Linked Controls Summary (v1.10.9) ────────────────────
function LinkedControlsSummary({ assessmentId, itemId }: { assessmentId: string; itemId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/admin/assessments/${assessmentId}/checklist-controls?itemId=${itemId}`)
      .then(r => r.json())
      .then(d => setCount((d.controls ?? []).filter((c: any) => c.isLinked).length))
      .catch(() => setCount(0));
  }, [assessmentId, itemId]);

  if (count === null || count === 0) return null;

  return (
    <span className="text-[10px] text-purple-500 ml-1">
      ({count} linked)
    </span>
  );
}
