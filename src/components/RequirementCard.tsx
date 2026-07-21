"use client";

import { Card } from "@/components/Card";
import { HealthIndicator } from "@/components/HealthIndicator";

type ControlSummary = { id: string; name: string; controlType: string; rawHealthScore?: number; _count?: { controlAssignments: number } };
type ReqData = { rId: number; requirementId: string; clauseContent: string; controls: ControlSummary[] };

type RequirementCardProps = {
  req: ReqData;
  isExpanded: boolean;
  onToggle: () => void;
  onDropControl?: (ctrlId: string, targetReqRId: number) => void;
  dragCtrlId: string | null;
  dragOverReqId: number | null;
  setDragCtrlId: (id: string | null) => void;
  setDragOverReqId: (id: number | null) => void;
  allReqs: ReqData[];
  onMoveControl: (ctrlId: string, targetReqRId: number) => void;
};

export function RequirementCard({ req, isExpanded, onToggle, onDropControl, dragCtrlId, dragOverReqId, setDragCtrlId, setDragOverReqId, allReqs, onMoveControl }: RequirementCardProps) {
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
            <h3 className="font-semibold text-sm text-slate-900">{req.requirementId} ({req.controls.length})</h3>
            <p className="text-xs text-slate-500 mt-0.5 whitespace-normal break-words">{req.clauseContent}</p>
          </div>
          <span className="text-xs text-slate-300">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </button>
      {isExpanded && req.controls.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="w-5"></th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Control</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Health</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Move to</th>
              </tr>
            </thead>
            <tbody>
              {req.controls.map((c) => (
                <tr key={c.id} draggable onDragStart={() => setDragCtrlId(c.id)} onDragEnd={() => { setDragCtrlId(null); setDragOverReqId(null); }}
                  className={`border-t border-slate-100 hover:bg-slate-50 cursor-grab ${dragCtrlId === c.id ? "opacity-40" : ""}`}>
                  <td className="px-1 py-2 text-slate-300 text-center select-none" title="Drag to move control">⋮⋮</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-2 text-slate-600">{c.controlType}</td>
                  <td className="px-4 py-2">
                    {(c._count?.controlAssignments ?? 0) === 0
                      ? <HealthIndicator score={0} size="sm" />
                      : <HealthIndicator score={c.rawHealthScore ?? 80} size="sm" />}
                  </td>
                  <td className="px-2 py-2">
                    <select aria-label={`Move ${c.name} to requirement`}
                      className="rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-500"
                      onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) onMoveControl(c.id, Number(v)); }}>
                      <option value="">Move to ▾</option>
                      {allReqs.filter((r) => r.rId !== req.rId).sort((a, b) => a.requirementId.localeCompare(b.requirementId)).map((r) => (
                        <option key={r.rId} value={r.rId}>{r.requirementId}</option>
                      ))}
                    </select>
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
    </Card>
  );
}
