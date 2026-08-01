"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { AttachmentList } from "@/components/AttachmentList";
import { VoiceInput } from "@/components/VoiceInput";

// ── Linked Controls Sub-Component (v1.10.1) ──────────────────────
function LinkedControlsSection({
  assessmentId, itemId, onAddFinding, item,
}: {
  assessmentId: string;
  itemId: string;
  onAddFinding?: (checklistItemId: string, itemText: string) => void;
  item: any;
}) {
  interface ScoredControl {
    controlId: string;
    controlName: string;
    controlStatement: string;
    controlType: string;
    processArea: string;
    score: number;
    isLinked: boolean;
    junctionId: string | null;
  }

  const [controls, setControls] = useState<ScoredControl[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/assessments/${assessmentId}/checklist-controls?itemId=${itemId}`)
      .then((r) => r.json())
      .then((d) => setControls(d.controls ?? []))
      .catch(() => setControls([]));
  }, [assessmentId, itemId]);

  if (!controls) return null; // loading

  const linked = controls.filter((c) => c.isLinked);
  const suggested = controls.filter((c) => !c.isLinked && c.score > 0);
  const [showAll, setShowAll] = useState(false);

  if (controls.length === 0) return null; // no assigned controls

  const handleLink = async (controlId: string) => {
    await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistItemId: itemId, controlId }),
    });
    // Refresh
    const r = await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls?itemId=${itemId}`);
    const d = await r.json();
    setControls(d.controls ?? []);
  };

  const handleUnlink = async (junctionId: string) => {
    // We need the junction ID — find it from the linked list
    await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls/${junctionId}`, { method: "DELETE" });
    const r = await fetch(`/api/admin/assessments/${assessmentId}/checklist-controls?itemId=${itemId}`);
    const d = await r.json();
    setControls(d.controls ?? []);
  };

  const displaySuggested = showAll ? suggested : suggested.slice(0, 5);

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      <p className="text-[10px] font-medium text-slate-400 mb-1">🔗 Linked Controls</p>
      {/* Linked controls */}
      {linked.map((c) => (
        <div key={c.controlId} className="flex items-center gap-1 text-[10px] text-slate-600 ml-1">
          <span className="text-emerald-500">✓</span>
          <span className="font-medium truncate max-w-[200px]" title={c.controlStatement}>
            {c.controlName}
          </span>
          <span className="text-slate-400">({c.score}%)</span>
          {c.junctionId && (
            <button
              onClick={() => handleUnlink(c.junctionId!)}
              className="text-red-400 hover:text-red-600 ml-1"
              title="Unlink"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {/* Suggested controls */}
      {displaySuggested.map((c) => (
        <button
          key={c.controlId}
          onClick={() => handleLink(c.controlId)}
          className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 ml-1 w-full text-left"
          title={c.controlStatement}
        >
          <span>＋</span>
          <span className="truncate max-w-[200px]">{c.controlName}</span>
          <span className="text-slate-400">({c.score}%)</span>
        </button>
      ))}
      {/* Show more */}
      {!showAll && suggested.length > 5 && (
        <button onClick={() => setShowAll(true)} className="text-[10px] text-blue-400 hover:text-blue-600 ml-1 mt-1">
          ＋ {suggested.length - 5} more suggestions
        </button>
      )}
      {showAll && suggested.length > 5 && (
        <button onClick={() => setShowAll(false)} className="text-[10px] text-slate-400 hover:text-slate-600 ml-1 mt-1">
          Show less
        </button>
      )}
      {linked.length === 0 && suggested.length === 0 && (
        <p className="text-[10px] text-slate-400 ml-1">No controls assigned to this assessment.</p>
      )}
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
                      {/* v1.10.1: Linked Controls */}
                      <LinkedControlsSection assessmentId={assessmentId} itemId={item.id} onAddFinding={onAddFinding} item={item} />
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
    </div>
  );
}
