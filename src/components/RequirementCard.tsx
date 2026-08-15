"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { HealthIndicator } from "@/components/HealthIndicator";
import { ControlDetailModal } from "@/components/ControlDetailModal";

type ControlSummary = {
  id: string;
  name: string;
  statement?: string | null;
  controlType: string;
  controlTypeDetail?: string | null;
  isHsseCritical?: boolean | null;
  ramRating?: string | null;
  riskWeight?: number | null;
  rawHealthScore?: number;
  lastTestedDate?: Date | string | null;
  lastTestResult?: string | null;
  csfWho?: string | null;
  csfWhat?: string | null;
  csfWhen?: string | null;
  csfWhere?: string | null;
  csfWhy?: string | null;
  csfHow?: string | null;
  csfEvidence?: string | null;
  keyActivities?: string | null;
  riskAddressed?: string | null;
  testingApproach?: string | null;
  effectivenessCriteria?: string | null;
  assuranceCadence?: string | null;
  controlOwner?: string | null;
  controlRef?: string | null;
  sourceFile?: string | null;
  practiceDocument?: string | null;
  standard?: string | null;
  uncertainFlags?: string | null;
  knowledge?: string | null;
  _count?: { controlAssignments: number };
  mandatory?: boolean;
  mcrId?: string;
};
type ReqData = {
  rId: number;
  requirementId: string;
  clauseContent: string;
  socStatus?: string | null;
  socSummary?: string | null;
  controls: ControlSummary[];
};

const SOC_LABELS: Record<string, string> = {
  FullyComply: "Fully Comply",
  PartiallyComply: "Partially Comply",
  NotComply: "Not Comply",
};
const SOC_BADGE: Record<string, string> = {
  FullyComply: "bg-green-100 text-green-800",
  PartiallyComply: "bg-amber-100 text-amber-800",
  NotComply: "bg-red-100 text-red-800",
};
const SOC_TEXT: Record<string, string> = {
  FullyComply: "text-green-700",
  PartiallyComply: "text-amber-700",
  NotComply: "text-red-700",
};
const SOC_PLACEHOLDER: Record<string, string> = {
  FullyComply: "Fully Comply because… (summary of the primary controls that satisfy this requirement)",
  PartiallyComply: "Partially Comply because… (controls that comply, and what is missing)",
  NotComply: "Not Comply because… (primary controls missing)",
};

type RequirementCardProps = {
  req: ReqData;
  isExpanded: boolean;
  onToggle: () => void;
  onDropControl?: (ctrlId: string, targetReqRId: number) => void;
  dragCtrlId: string | null;
  dragOverReqId: number | null;
  setDragCtrlId: (id: string | null) => void;
  setDragOverReqId: (id: number | null) => void;
  canEdit?: boolean;
  onToggleMandatory?: (mcrId: string, next: boolean) => void;
  onSaveSoc?: (rId: number, status: string | null, summary: string) => Promise<void>;
};

export function RequirementCard({ req, isExpanded, onToggle, onDropControl, dragCtrlId, dragOverReqId, setDragCtrlId, setDragOverReqId, canEdit, onToggleMandatory, onSaveSoc }: RequirementCardProps) {
  const [detailCtrl, setDetailCtrl] = useState<ControlSummary | null>(null);
  const [editingSoc, setEditingSoc] = useState(false);
  const [socStatusDraft, setSocStatusDraft] = useState("");
  const [socSummaryDraft, setSocSummaryDraft] = useState("");
  const [socSaving, setSocSaving] = useState(false);

  const handleSaveSoc = async () => {
    if (!onSaveSoc || !socStatusDraft) return;
    setSocSaving(true);
    await onSaveSoc(req.rId, socStatusDraft, socSummaryDraft);
    setSocSaving(false);
    setEditingSoc(false);
  };
  return (
    <Card padding="none" className="overflow-hidden">
      <button
        onClick={onToggle}
        onDragOver={(e) => { e.preventDefault(); setDragOverReqId(req.rId); }}
        onDragLeave={() => setDragOverReqId(null)}
        onDrop={(e) => { e.preventDefault(); setDragOverReqId(null); if (dragCtrlId && onDropControl) onDropControl(dragCtrlId, req.rId); }}
        className={`w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors ${dragOverReqId === req.rId ? "bg-blue-100" : ""}`}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-slate-900">
              {req.requirementId} ({req.controls.length})
              {req.socStatus && (
                <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${SOC_BADGE[req.socStatus] ?? "bg-slate-100 text-slate-600"}`}>
                  {SOC_LABELS[req.socStatus] ?? req.socStatus}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 whitespace-normal break-words">{req.clauseContent}</p>
          </div>
          <span className="text-xs text-slate-300">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Statement of Compliance</h4>
            {canEdit && !editingSoc && (
              <button
                type="button"
                onClick={() => { setSocStatusDraft(req.socStatus ?? ""); setSocSummaryDraft(req.socSummary ?? ""); setEditingSoc(true); }}
                className="text-xs text-blue-600 hover:underline"
              >
                ✏️ Edit
              </button>
            )}
          </div>
          {editingSoc ? (
            <div className="space-y-2">
              <select
                value={socStatusDraft}
                onChange={(e) => setSocStatusDraft(e.target.value)}
                className="w-full sm:w-64 rounded border border-slate-300 px-2 py-1 text-sm bg-white"
              >
                <option value="">-- Select status --</option>
                <option value="FullyComply">Fully Comply</option>
                <option value="PartiallyComply">Partially Comply</option>
                <option value="NotComply">Not Comply</option>
              </select>
              <textarea
                value={socSummaryDraft}
                onChange={(e) => setSocSummaryDraft(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={SOC_PLACEHOLDER[socStatusDraft] ?? "Statement summary…"}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{socSummaryDraft.length}/1000</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditingSoc(false)} className="text-xs text-slate-500 hover:underline">Cancel</button>
                  <button
                    type="button"
                    disabled={socSaving || !socStatusDraft}
                    onClick={handleSaveSoc}
                    className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {socSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : req.socStatus ? (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              <span className={`font-semibold ${SOC_TEXT[req.socStatus] ?? ""}`}>{SOC_LABELS[req.socStatus] ?? req.socStatus} because </span>
              {req.socSummary || "(no summary recorded)"}
            </p>
          ) : (
            <p className="text-sm text-slate-400">No statement recorded yet.</p>
          )}
        </div>
      )}
      {isExpanded && req.controls.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="w-5"></th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Control</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Health</th>
                <th className="px-4 py-2 text-center font-medium text-slate-600">Mandatory</th>
              </tr>
            </thead>
            <tbody>
              {req.controls.map((c) => (
                <tr key={c.id} draggable onDragStart={() => setDragCtrlId(c.id)} onDragEnd={() => { setDragCtrlId(null); setDragOverReqId(null); }}
                  className={`border-t border-slate-100 hover:bg-slate-50 cursor-grab ${dragCtrlId === c.id ? "opacity-40" : ""}`}>
                  <td className="px-1 py-2 text-slate-300 text-center select-none" title="Drag to move control">⋮⋮</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setDetailCtrl(c)}
                      className="text-left font-medium text-blue-700 hover:underline"
                      title="View control details"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{c.controlType}</td>
                  <td className="px-4 py-2">
                    {(c._count?.controlAssignments ?? 0) === 0
                      ? <HealthIndicator score={0} size="sm" />
                      : <HealthIndicator score={c.rawHealthScore ?? 80} size="sm" />}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {canEdit && onToggleMandatory && c.mcrId ? (
                      <button
                        type="button"
                        aria-label={`Toggle mandatory for ${c.name}`}
                        title={c.mandatory ? "Mandatory — click to remove" : "Not mandatory — click to set"}
                        onClick={() => onToggleMandatory(c.mcrId!, !c.mandatory)}
                        className={`text-sm leading-none ${c.mandatory ? "text-amber-500" : "text-slate-300 hover:text-slate-500"}`}
                      >
                        {c.mandatory ? "★" : "☆"}
                      </button>
                    ) : (
                      <span className={`text-sm ${c.mandatory ? "text-amber-500" : "text-slate-300"}`}>{c.mandatory ? "★" : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isExpanded && req.controls.length === 0 && (
        <p className="px-4 py-4 text-center text-sm text-slate-400">No controls linked.</p>
      )}
      {detailCtrl && (
        <ControlDetailModal control={detailCtrl} requirementId={req.requirementId} onClose={() => setDetailCtrl(null)} />
      )}
    </Card>
  );
}
