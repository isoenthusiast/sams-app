"use client";

import { useEffect, useState } from "react";

interface ChecklistSummary {
  auditStandard: string;
  total: number;
  compliant: number;
  nonCompliant: number;
  notTested: number;
  notApplicable: number;
  observation: number;
}

interface Props {
  assessment: any;
  assessmentId: string;
}

export function AuditReportTab({ assessment, assessmentId }: Props) {
  const [checklistSummary, setChecklistSummary] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/assessments/${assessmentId}/checklist`)
      .then((r) => r.json())
      .then((items: any[]) => {
        if (!Array.isArray(items)) return;
        const byStandard = new Map<string, ChecklistSummary>();
        for (const item of items) {
          const key = item.auditStandard;
          if (!byStandard.has(key)) {
            byStandard.set(key, { auditStandard: key, total: 0, compliant: 0, nonCompliant: 0, notTested: 0, notApplicable: 0, observation: 0 });
          }
          const s = byStandard.get(key)!;
          s.total++;
          const status = item.complianceStatus;
          if (status === "Compliant") s.compliant++;
          else if (status === "NonCompliant") s.nonCompliant++;
          else if (status === "NotApplicable") s.notApplicable++;
          else if (status === "Observation") s.observation++;
          else s.notTested++;
        }
        setChecklistSummary(Array.from(byStandard.values()));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [assessmentId]);

  const findings = assessment.findings ?? [];
  const controlAssignments = assessment.controlAssignments ?? [];
  const effectiveCount = controlAssignments.filter((ca: any) => ca.effective === "Effective").length;
  const notEffectiveCount = controlAssignments.filter((ca: any) => ca.effective === "NotEffective").length;

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6 print:space-y-4" id="audit-report">
      {/* Print button */}
      <div className="flex justify-end print:hidden">
        <button onClick={handlePrint}
          className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900">
          🖨️ Print Report
        </button>
      </div>

      {/* Header */}
      <div className="border-b border-slate-300 pb-4">
        <h2 className="text-xl font-bold text-slate-900">{assessment.name}</h2>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>Type: {assessment.activityType?.name ?? "—"}</span>
          <span>LOA: {assessment.loa ?? "—"}</span>
          <span>Status: {assessment.status}</span>
          <span>Date: {assessment.startDate ? new Date(assessment.startDate).toLocaleDateString() : "—"}</span>
          <span>Assessor: {assessment.assessor?.name ?? "—"}</span>
        </div>
      </div>

      {/* Terms of Reference */}
      {(assessment.objective || assessment.scope || assessment.methodology) && (
        <div className="print:break-inside-avoid">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">📝 Terms of Reference</h3>
          <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
            {assessment.objective && (
              <div><span className="font-medium text-slate-600">Objective:</span> {assessment.objective}</div>
            )}
            {assessment.scope && (
              <div><span className="font-medium text-slate-600">Scope:</span> {assessment.scope}</div>
            )}
            {assessment.sponsor && (
              <div><span className="font-medium text-slate-600">Sponsor:</span> {assessment.sponsor}</div>
            )}
            {assessment.methodology && (
              <div><span className="font-medium text-slate-600">Methodology:</span> {assessment.methodology}</div>
            )}
            {assessment.keyFocus && (
              <div><span className="font-medium text-slate-600">Key Focus:</span> {assessment.keyFocus}</div>
            )}
          </div>
        </div>
      )}

      {/* Checklist Compliance Summary */}
      <div className="print:break-inside-avoid">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">✅ Checklist Compliance Summary</h3>
        {loading ? (
          <p className="text-sm text-slate-400">Loading checklist data…</p>
        ) : checklistSummary.length === 0 ? (
          <p className="text-sm text-slate-400">No checklist adopted for this assessment.</p>
        ) : (
          <table className="w-full text-xs border border-slate-200 rounded overflow-hidden">
            <thead>
              <tr className="bg-slate-100 text-left text-slate-600">
                <th className="px-3 py-2 font-medium">Standard</th>
                <th className="px-3 py-2 font-medium text-center">Total</th>
                <th className="px-3 py-2 font-medium text-center text-emerald-700">✓ Compliant</th>
                <th className="px-3 py-2 font-medium text-center text-red-600">✗ Non-Compliant</th>
                <th className="px-3 py-2 font-medium text-center text-amber-600">⚠ Observation</th>
                <th className="px-3 py-2 font-medium text-center text-slate-400">N/A</th>
                <th className="px-3 py-2 font-medium text-center text-slate-400">Not Tested</th>
              </tr>
            </thead>
            <tbody>
              {checklistSummary.map((s) => (
                <tr key={s.auditStandard} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-700">{s.auditStandard}</td>
                  <td className="px-3 py-2 text-center">{s.total}</td>
                  <td className="px-3 py-2 text-center text-emerald-700 font-medium">{s.compliant}</td>
                  <td className="px-3 py-2 text-center text-red-600 font-medium">{s.nonCompliant}</td>
                  <td className="px-3 py-2 text-center text-amber-600 font-medium">{s.observation}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{s.notApplicable}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{s.notTested}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2 text-slate-700">TOTAL</td>
                <td className="px-3 py-2 text-center">{checklistSummary.reduce((a, s) => a + s.total, 0)}</td>
                <td className="px-3 py-2 text-center text-emerald-700">{checklistSummary.reduce((a, s) => a + s.compliant, 0)}</td>
                <td className="px-3 py-2 text-center text-red-600">{checklistSummary.reduce((a, s) => a + s.nonCompliant, 0)}</td>
                <td className="px-3 py-2 text-center text-amber-600">{checklistSummary.reduce((a, s) => a + s.observation, 0)}</td>
                <td className="px-3 py-2 text-center text-slate-400">{checklistSummary.reduce((a, s) => a + s.notApplicable, 0)}</td>
                <td className="px-3 py-2 text-center text-slate-400">{checklistSummary.reduce((a, s) => a + s.notTested, 0)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Control Effectiveness */}
      <div className="print:break-inside-avoid">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">⚙️ Control Effectiveness</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-2xl font-bold text-emerald-700">{effectiveCount}</div>
            <div className="text-xs text-emerald-600">Effective</div>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 p-3">
            <div className="text-2xl font-bold text-amber-700">{notEffectiveCount}</div>
            <div className="text-xs text-amber-600">Not Effective</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-2xl font-bold text-slate-600">{controlAssignments.length - effectiveCount - notEffectiveCount}</div>
            <div className="text-xs text-slate-500">Not Assessed</div>
          </div>
        </div>
      </div>

      {/* Findings */}
      <div className="print:break-inside-avoid">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">🔍 Findings ({findings.length})</h3>
        {findings.length === 0 ? (
          <p className="text-sm text-slate-400">No findings recorded.</p>
        ) : (
          <div className="space-y-2">
            {findings.map((f: any) => (
              <div key={f.id} className="rounded border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">{f.id}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        f.severity === "Serious" ? "bg-red-100 text-red-700" :
                        f.severity === "High" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>{f.severity}</span>
                      {f.repeat && <span className="text-xs text-amber-600">🔄 Repeat</span>}
                    </div>
                    <p className="text-sm text-slate-800 mt-1">{f.description}</p>
                    {f.details && <p className="text-xs text-slate-500 mt-1">{f.details}</p>}
                    {f.risks && <p className="text-xs text-red-600 mt-1">⚠ Risks: {f.risks}</p>}
                    {f.checklistItem && (
                      <p className="text-xs text-blue-600 mt-1">
                        📋 Linked to: {f.checklistItem.checklistItemId} — {f.checklistItem.checklistText?.substring(0, 60)}
                      </p>
                    )}
                  </div>
                </div>
                {/* Actions */}
                {f.actions?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-500 mb-1">Actions ({f.actions.length}):</p>
                    {f.actions.map((a: any) => (
                      <div key={a.id} className="text-xs text-slate-600 ml-2">
                        • {a.actionDescription}
                        {a.targetDate && <span className="text-slate-400"> — Due: {new Date(a.targetDate).toLocaleDateString()}</span>}
                        {a.actionClosureEffective && <span className="text-emerald-600 ml-1">✓ Closed</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-300 pt-3 text-xs text-slate-400 print:mt-8">
        <p>Generated by SAMS (Seam Assurance Management System) on {new Date().toLocaleDateString()}</p>
        <p>Assessment ID: {assessment.id}</p>
      </div>
    </div>
  );
}
