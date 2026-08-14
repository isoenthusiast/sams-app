"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";
import ControlTreePanel from "@/components/ControlTreePanel";

interface MinimalistViewProps {
  assessment: any;
  allControls: any[];
  controlsLoaded: boolean;
  setActiveTab: (tab: any) => void;
  setView: (view: "minimalist" | "classic") => void;
}

type ModuleKey = "details" | "controls" | "samples" | "findings";

export default function MinimalistView({ assessment, allControls, controlsLoaded, setActiveTab, setView }: MinimalistViewProps) {
  const [expanded, setExpanded] = useState<Set<ModuleKey>>(new Set(["details"]));
  const [samples, setSamples] = useState<any[]>(assessment.samples || []);
  const [findings, setFindings] = useState<any[]>(assessment.findings || []);
  const [saving, setSaving] = useState(false);

  const controls = assessment.controlAssignments || [];
  const openFindings = findings.filter((f: any) => !f.actions?.some((a: any) => a.actionClosureEffective));
  const highFindings = findings.filter((f: any) => f.severity === "High" || f.severity === "Serious");

  const toggle = (key: ModuleKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const refreshSamples = async () => {
    const res = await fetch(`/api/admin/samples?assessmentId=${assessment.id}`);
    if (res.ok) setSamples(await res.json());
  };
  const refreshFindings = async () => {
    const res = await fetch(`/api/admin/findings?assessmentId=${assessment.id}`);
    if (res.ok) {
      const data = await res.json();
      setFindings(Array.isArray(data) ? data : data.findings || []);
    }
  };

  // ─── Sample CRUD state ───
  const [showAddSample, setShowAddSample] = useState(false);
  const [sampleForm, setSampleForm] = useState({ sampleTypeId: "", recordSourceId: "", recordReference: "", comment: "" });
  const [sampleTypes, setSampleTypes] = useState<any[]>([]);
  const [recordSources, setRecordSources] = useState<any[]>([]);

  useEffect(() => {
    // Load sample types and record sources from the assessment page's server data
    // (These are passed via the assessment page props, not a separate API)
  }, []);

  const addSample = async () => {
    if (!sampleForm.sampleTypeId) { showToast("Select a sample type", "error"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/samples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sampleForm, assessmentId: assessment.id }),
    });
    if (res.ok) {
      await refreshSamples();
      setShowAddSample(false);
      setSampleForm({ sampleTypeId: "", recordSourceId: "", recordReference: "", comment: "" });
      showToast("Sample added", "success");
    } else {
      const err = await res.json();
      showToast(err.error || "Failed", "error");
    }
    setSaving(false);
  };

  const deleteSample = async (id: string) => {
    if (!confirm("Delete this sample?")) return;
    const res = await fetch(`/api/admin/samples/${id}`, { method: "DELETE" });
    if (res.ok) { await refreshSamples(); showToast("Sample deleted", "success"); }
    else showToast("Failed to delete", "error");
  };

  // ─── Finding CRUD state ───
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [findingForm, setFindingForm] = useState({ description: "", severity: "Low", risks: "", details: "" });

  const addFinding = async () => {
    if (!findingForm.description.trim()) { showToast("Description required", "error"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/findings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...findingForm, assessmentId: assessment.id }),
    });
    if (res.ok) {
      await refreshFindings();
      setShowAddFinding(false);
      setFindingForm({ description: "", severity: "Low", risks: "", details: "" });
      showToast("Finding added", "success");
    } else {
      const err = await res.json();
      showToast(err.error || "Failed", "error");
    }
    setSaving(false);
  };

  const deleteFinding = async (id: string) => {
    if (!confirm("Delete this finding and all its actions?")) return;
    const res = await fetch(`/api/admin/findings/${id}`, { method: "DELETE" });
    if (res.ok) { await refreshFindings(); showToast("Finding deleted", "success"); }
    else showToast("Failed to delete", "error");
  };

  return (
    <div className="mt-4 space-y-3">
      {/* Top bar: stats + Audit Report button */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid grid-cols-4 gap-2 flex-1">
          {[
            { label: "Findings", value: findings.length, color: "text-slate-900" },
            { label: "Open", value: openFindings.length, color: "text-amber-700" },
            { label: "Samples", value: samples.length, color: "text-slate-900" },
            { label: "Controls", value: controls.length, color: "text-slate-900" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setView("classic"); setActiveTab("report"); }}
          className="rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-800 shrink-0"
        >
          📄 Audit Report
        </button>
      </div>

      {/* High/Severe alert */}
      {highFindings.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-red-800">
              ⚠️ {highFindings.length} High / Serious finding{highFindings.length !== 1 ? "s" : ""}
            </span>
            <button onClick={() => { setView("classic"); setActiveTab("findings"); }} className="text-xs text-red-600 hover:underline">
              Review in Classic →
            </button>
          </div>
        </div>
      )}

      {/* ─── MODULE: Details ─── */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <button onClick={() => toggle("details")} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span>{expanded.has("details") ? "▼" : "▶"}</span> Details
          </span>
        </button>
        {expanded.has("details") && (
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div><span className="text-slate-400">Start</span><p className="font-medium">{assessment.startDate ? new Date(assessment.startDate).toLocaleDateString() : "—"}</p></div>
              <div><span className="text-slate-400">End</span><p className="font-medium">{assessment.endDate ? new Date(assessment.endDate).toLocaleDateString() : "—"}</p></div>
              <div><span className="text-slate-400">Activity</span><p className="font-medium">{assessment.activityType?.name || "—"}</p></div>
              <div><span className="text-slate-400">LOA</span><p className="font-medium">{assessment.loa || "—"}</p></div>
            </div>
            {assessment.objective && (
              <div className="mt-2"><span className="text-slate-400 text-xs">Objective</span><p className="text-sm">{assessment.objective}</p></div>
            )}
            {assessment.scope && (
              <div className="mt-1"><span className="text-slate-400 text-xs">Scope</span><p className="text-sm text-slate-600">{assessment.scope}</p></div>
            )}
            <button onClick={() => { setView("classic"); setActiveTab("overview"); }} className="mt-2 text-xs text-blue-600 hover:underline">
              Edit Details in Classic →
            </button>
          </div>
        )}
      </div>

      {/* ─── MODULE: Requirements and Controls Assignment ─── */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <button onClick={() => toggle("controls")} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span>{expanded.has("controls") ? "▼" : "▶"}</span> Requirements and Controls Assignment
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{controls.length}</span>
          </span>
        </button>
        {expanded.has("controls") && (
          <div className="border-t border-slate-100 px-4 py-3">
            <ControlTreePanel
              assessmentId={assessment.id}
              onCreateFinding={() => {
                setView("classic");
                setActiveTab("findings");
              }}
            />
          </div>
        )}
      </div>

      {/* ─── MODULE: Samples ─── */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <button onClick={() => toggle("samples")} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span>{expanded.has("samples") ? "▼" : "▶"}</span> Samples
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{samples.length}</span>
          </span>
        </button>
        {expanded.has("samples") && (
          <div className="border-t border-slate-100 px-4 py-3">
            {samples.length === 0 && !showAddSample ? (
              <p className="text-sm text-slate-400">No samples.</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {samples.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-slate-800">{s.sampleType?.name || "Sample"}</span>
                      {s.recordReference && <span className="ml-2 text-xs text-slate-400">Ref: {s.recordReference}</span>}
                      {s.recordSource && <span className="ml-1 text-xs text-slate-400">· {s.recordSource.name}</span>}
                    </div>
                    <button onClick={() => deleteSample(s.id)} className="ml-2 text-xs text-red-500 hover:text-red-700" title="Delete">✕</button>
                  </div>
                ))}
              </div>
            )}
            {showAddSample ? (
              <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <select value={sampleForm.sampleTypeId} onChange={e => setSampleForm({...sampleForm, sampleTypeId: e.target.value})}
                    className="rounded border border-slate-300 px-2 py-1 text-xs">
                    <option value="">Sample Type</option>
                    {sampleTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={sampleForm.recordSourceId} onChange={e => setSampleForm({...sampleForm, recordSourceId: e.target.value})}
                    className="rounded border border-slate-300 px-2 py-1 text-xs">
                    <option value="">Source</option>
                    {recordSources.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input value={sampleForm.recordReference} onChange={e => setSampleForm({...sampleForm, recordReference: e.target.value})}
                    placeholder="Reference" className="rounded border border-slate-300 px-2 py-1 text-xs col-span-2" />
                  <input value={sampleForm.comment} onChange={e => setSampleForm({...sampleForm, comment: e.target.value})}
                    placeholder="Comment" className="rounded border border-slate-300 px-2 py-1 text-xs col-span-2" />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" size="sm" disabled={saving} onClick={addSample}>{saving ? "Saving…" : "Save"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddSample(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddSample(true)} className="mt-2 text-xs text-blue-600 hover:underline">＋ Add Sample</button>
            )}
          </div>
        )}
      </div>

      {/* ─── MODULE: Findings ─── */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <button onClick={() => toggle("findings")} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span>{expanded.has("findings") ? "▼" : "▶"}</span> Findings
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{findings.length}</span>
            {openFindings.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{openFindings.length} open</span>
            )}
          </span>
        </button>
        {expanded.has("findings") && (
          <div className="border-t border-slate-100 px-4 py-3">
            {findings.length === 0 && !showAddFinding ? (
              <p className="text-sm text-slate-400">No findings.</p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {findings.map((f: any) => {
                  const closed = f.actions?.some((a: any) => a.actionClosureEffective);
                  return (
                    <div key={f.id} className="flex items-start justify-between rounded border border-slate-100 px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                            f.severity === "Serious" ? "bg-red-100 text-red-800" :
                            f.severity === "High" ? "bg-amber-100 text-amber-800" :
                            f.severity === "Medium" ? "bg-yellow-100 text-yellow-800" :
                            "bg-slate-100 text-slate-600"
                          }`}>{f.severity}</span>
                          <span className="text-sm text-slate-800 whitespace-pre-wrap">{f.description}</span>
                        </div>
                        {f.riskDescription && (
                          <p className="ml-1 mt-0.5 text-xs text-slate-500">{f.riskDescription}</p>
                        )}
                        {f.details && (
                          <p className="ml-1 mt-0.5 text-xs text-slate-500"><strong>Gap:</strong> {f.details}</p>
                        )}
                        {f.recommendation && !f.recommendation.startsWith("[RESOLVED") && (
                          <p className="ml-1 mt-0.5 text-xs text-slate-600 rounded bg-blue-50 p-1"><strong>Proposed:</strong> {f.recommendation}</p>
                        )}
                        {f.recommendation && f.recommendation.startsWith("[RESOLVED") && (
                          <span className="ml-1 text-xs text-green-600">✓ Resolved</span>
                        )}
                      </div>
                      <div className="ml-2 flex items-center gap-1 shrink-0">
                        {closed ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Closed</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Open</span>
                        )}
                        <button onClick={() => deleteFinding(f.id)} className="text-xs text-red-400 hover:text-red-600" title="Delete">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {showAddFinding ? (
              <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-3">
                <input value={findingForm.description} onChange={e => setFindingForm({...findingForm, description: e.target.value})}
                  placeholder="Finding description" className="w-full rounded border border-slate-300 px-2 py-1 text-xs mb-2" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={findingForm.severity} onChange={e => setFindingForm({...findingForm, severity: e.target.value})}
                    className="rounded border border-slate-300 px-2 py-1 text-xs">
                    <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Serious">Serious</option>
                  </select>
                  <input value={findingForm.risks} onChange={e => setFindingForm({...findingForm, risks: e.target.value})}
                    placeholder="Risk description" className="rounded border border-slate-300 px-2 py-1 text-xs" />
                  <input value={findingForm.details} onChange={e => setFindingForm({...findingForm, details: e.target.value})}
                    placeholder="Details" className="rounded border border-slate-300 px-2 py-1 text-xs col-span-2" />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" size="sm" disabled={saving} onClick={addFinding}>{saving ? "Saving…" : "Save"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddFinding(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddFinding(true)} className="mt-2 text-xs text-blue-600 hover:underline">＋ Add Finding</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
