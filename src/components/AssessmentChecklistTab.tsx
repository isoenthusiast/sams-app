"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { AttachmentList } from "@/components/AttachmentList";

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

export function AssessmentChecklistTab({ assessmentId }: { assessmentId: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/assessments/${assessmentId}/checklist`)
      .then((r) => r.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [assessmentId]);

  const updateStatus = async (itemId: string, status: string) => {
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
                      {item.auditorNotes && (
                        <p className="text-xs text-slate-500 mt-1 italic">📝 {item.auditorNotes}</p>
                      )}
                      {/* T2.2: Evidence attachments per checklist item */}
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <AttachmentList destTable="AuditChecklistItem" recId={item.id} />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <select
                        value={item.complianceStatus}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
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
