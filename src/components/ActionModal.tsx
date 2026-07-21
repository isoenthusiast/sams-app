"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { showToast } from "@/components/Toast";

type ActionData = {
  id: string;
  actionId: string | null;
  actionDescription: string;
  actionDetails: string | null;
  actionTaken: string | null;
  actionParty: string | null;
  targetDate: string | null;
  actionClosureEffective: boolean;
  finding: {
    id: string;
    description: string;
    severity: string;
    risks: string | null;
    assessment: {
      id: string;
      name: string;
      status: string;
      startDate: string;
      activityType: { name: string };
      assessor: { name: string };
    };
  };
};

type Props = {
  action: ActionData;
  onClose: () => void;
  onSaved: () => void;
};

export function ActionModal({ action, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [actionTaken, setActionTaken] = useState(action.actionTaken ?? "");
  const [closureEffective, setClosureEffective] = useState(action.actionClosureEffective);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/table/Action/${action.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionTaken: actionTaken || null,
          actionClosureEffective: closureEffective,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast("Action updated.", "success");
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const f = action.finding;
  const a = f.assessment;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/40" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Action details"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 rounded-t-lg">
          <h2 className="text-lg font-semibold text-slate-900">Action Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Assessment Header */}
          <Card title="📋 Assessment" padding="sm">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Name:</span> <span className="font-medium">{a.name}</span></div>
              <div><span className="text-slate-500">Status:</span> <StatusBadge status={a.status} /></div>
              <div><span className="text-slate-500">Type:</span> {a.activityType.name}</div>
              <div><span className="text-slate-500">Assessor:</span> {a.assessor.name}</div>
              <div><span className="text-slate-500">Date:</span> {new Date(a.startDate).toLocaleDateString()}</div>
            </div>
          </Card>

          {/* Finding Details */}
          <Card title="🔍 Finding" padding="sm">
            <div className="space-y-2 text-sm">
              <div><span className="text-slate-500">Severity:</span> <span className={`font-medium ${f.severity === "Serious" || f.severity === "High" ? "text-red-700" : f.severity === "Medium" ? "text-amber-700" : "text-slate-700"}`}>{f.severity}</span></div>
              <div><span className="text-slate-500">Description:</span> <p className="mt-1 text-slate-800">{f.description}</p></div>
              {f.risks && <div><span className="text-slate-500">Risks:</span> <p className="mt-1 text-slate-700">{f.risks}</p></div>}
            </div>
          </Card>

          {/* Action Details — EDITABLE */}
          <Card title="✅ Action (Editable)" padding="sm">
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-slate-500">Description:</span>
                <p className="mt-1 font-medium text-slate-900">{action.actionDescription}</p>
              </div>
              {action.actionParty && (
                <div><span className="text-slate-500">Assigned to:</span> {action.actionParty}</div>
              )}
              {action.targetDate && (
                <div><span className="text-slate-500">Target Date:</span> {new Date(action.targetDate).toLocaleDateString()}</div>
              )}

              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Action Taken</label>
                  <textarea
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none min-h-[80px]"
                    placeholder="Describe what was done…"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={closureEffective}
                    onChange={(e) => setClosureEffective(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="text-sm text-slate-700">Closure Effective</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
                  {saving ? "Saving…" : "Save Action"}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
