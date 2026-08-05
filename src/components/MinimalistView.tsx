"use client";

import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";

interface MinimalistViewProps {
  assessment: any;
  allControls: any[];
  controlsLoaded: boolean;
  setActiveTab: (tab: any) => void;
  setView: (view: "minimalist" | "classic") => void;
}

export default function MinimalistView({ assessment, allControls, controlsLoaded, setActiveTab, setView }: MinimalistViewProps) {
  const findings = assessment.findings || [];
  const samples = assessment.samples || [];
  const controls = assessment.controlAssignments || [];
  const openFindings = findings.filter((f: any) => !f.actions?.some((a: any) => a.actionClosureEffective));
  const highFindings = findings.filter((f: any) => f.severity === "High" || f.severity === "Serious");

  return (
    <div className="mt-4 space-y-4">
      {/* Key stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="text-center">
          <div className="text-2xl font-bold text-slate-900">{findings.length}</div>
          <div className="text-xs text-slate-500">Findings</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-amber-700">{openFindings.length}</div>
          <div className="text-xs text-slate-500">Open</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-slate-900">{samples.length}</div>
          <div className="text-xs text-slate-500">Samples</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-slate-900">{controls.length}</div>
          <div className="text-xs text-slate-500">Controls</div>
        </Card>
      </div>

      {/* Dates + Details */}
      <Card title="Details" className="space-y-2">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <span className="text-slate-400">Start</span>
            <p className="font-medium">{assessment.startDate ? new Date(assessment.startDate).toLocaleDateString() : "—"}</p>
          </div>
          <div>
            <span className="text-slate-400">End</span>
            <p className="font-medium">{assessment.endDate ? new Date(assessment.endDate).toLocaleDateString() : "—"}</p>
          </div>
          <div>
            <span className="text-slate-400">Activity</span>
            <p className="font-medium">{assessment.activityType?.name || "—"}</p>
          </div>
          <div>
            <span className="text-slate-400">LOA</span>
            <p className="font-medium">{assessment.loa || "—"}</p>
          </div>
          <div className="col-span-2 sm:col-span-4 mt-1">
            <span className="text-slate-400">Objective</span>
            <p className="text-sm">{assessment.objective || "No objective recorded."}</p>
          </div>
          {assessment.scope && (
            <div className="col-span-2 sm:col-span-4 mt-1">
              <span className="text-slate-400">Scope</span>
              <p className="text-sm text-slate-600">{assessment.scope}</p>
            </div>
          )}
        </div>
      </Card>

      {/* High/Severe findings — attention grab */}
      {highFindings.length > 0 && (
        <Card title={`⚠️ ${highFindings.length} High / Serious Finding${highFindings.length !== 1 ? "s" : ""}`}>
          <div className="space-y-2">
            {highFindings.slice(0, 5).map((f: any) => (
              <div key={f.id} className="flex items-start justify-between rounded border border-amber-200 bg-amber-50 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.severity === "Serious" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {f.severity}
                    </span>
                    <span className="text-sm font-medium text-slate-900 truncate">{f.description}</span>
                  </div>
                  {f.riskDescription && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{f.riskDescription}</p>
                  )}
                </div>
                <button
                  onClick={() => { setView("classic"); setActiveTab("findings"); }}
                  className="ml-2 shrink-0 text-xs text-blue-600 hover:underline"
                >
                  View
                </button>
              </div>
            ))}
            {highFindings.length > 5 && (
              <button
                onClick={() => { setView("classic"); setActiveTab("findings"); }}
                className="text-xs text-blue-600 hover:underline"
              >
                +{highFindings.length - 5} more → Classic View
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Recent findings */}
      <Card title={`📋 Recent Findings (${findings.length} total)`}>
        {findings.length === 0 ? (
          <p className="text-sm text-slate-400">No findings recorded.</p>
        ) : (
          <div className="space-y-2">
            {findings.slice(0, 8).map((f: any) => {
              const hasAction = f.actions?.some((a: any) => a.actionClosureEffective);
              return (
                <div key={f.id} className="flex items-start justify-between rounded border border-slate-100 p-2 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                        f.severity === "Serious" ? "bg-red-100 text-red-800" :
                        f.severity === "High" ? "bg-amber-100 text-amber-800" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {f.severity?.charAt(0) || "?"}
                      </span>
                      <span className="text-sm text-slate-800 truncate">{f.description}</span>
                    </div>
                    {f.recommendation && f.recommendation.startsWith("[RESOLVED") && (
                      <span className="ml-7 text-xs text-green-600">✓ Resolved</span>
                    )}
                  </div>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    hasAction ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {hasAction ? "Closed" : "Open"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {findings.length > 8 && (
          <button
            onClick={() => { setView("classic"); setActiveTab("findings"); }}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            View all {findings.length} findings in Classic View →
          </button>
        )}
      </Card>

      {/* Quick actions */}
      <Card title="Quick Actions">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => { setView("classic"); setActiveTab("findings"); }}>
            ＋ Add Finding
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setView("classic"); setActiveTab("samples"); }}>
            🧪 Manage Samples
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setView("classic"); setActiveTab("controls"); }}>
            ⚙️ Controls ({controls.length})
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setView("classic"); setActiveTab("checklist"); }}>
            📋 Checklist
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setView("classic"); setActiveTab("report"); }}>
            📄 Report
          </Button>
        </div>
      </Card>
    </div>
  );
}
