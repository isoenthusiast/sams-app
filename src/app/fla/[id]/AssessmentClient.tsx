"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { FindingCard } from "@/components/FindingCard";
import { showToast } from "@/components/Toast";
import { VoiceInput } from "@/components/VoiceInput";
import AssessmentActivitiesPanel from "@/components/AssessmentActivitiesPanel";

type Props = {
  assessment: any;
  allControls: any[];
  processAreas: Array<{ id: string; name: string }>;
  activityTypes: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; role: string }>;
  sampleTypes: Array<{ id: string; name: string }>;
  recordSources: Array<{ id: string; name: string }>;
  currentUserId?: string;
};

export default function AssessmentClient({ assessment, allControls, processAreas, activityTypes, users, sampleTypes, recordSources, currentUserId }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "controls" | "samples" | "findings" | "activities">("overview");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAddSample, setShowAddSample] = useState(false);
  const [sampleForm, setSampleForm] = useState({ sampleTypeId: "", recordSourceId: "", recordReference: "", comment: "" });
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [findingForm, setFindingForm] = useState({ description: "", severity: "Low", risks: "", details: "", repeat: false, controlIds: new Set<string>() });
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [actionForms, setActionForms] = useState<Record<string, { description: string; party: string; details: string; targetDate: string }>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Group controls: Standard → ProcessArea → Requirement
  const groupedControls = (() => {
    const stds = new Map<string, Map<string, Map<string, any[]>>>();
    for (const c of allControls) {
      const std = c.processArea?.standardRef?.standard ?? c.standard ?? "Other";
      const pa = c.processArea?.name ?? "Unknown";
      const reqs = c.requirementMappings ?? [];
      if (reqs.length === 0) {
        if (!stds.has(std)) stds.set(std, new Map());
        const pas = stds.get(std)!;
        if (!pas.has(pa)) pas.set(pa, new Map());
        const reqsMap = pas.get(pa)!;
        if (!reqsMap.has("__unmapped__")) reqsMap.set("__unmapped__", []);
        reqsMap.get("__unmapped__")!.push(c);
      } else {
        for (const rm of reqs) {
          const reqId = rm.requirement?.requirementId ?? "Unknown";
          const reqLabel = rm.requirement?.clauseContent
            ? `${reqId}: ${rm.requirement.clauseContent.substring(0, 60)}`
            : reqId;
          if (!stds.has(std)) stds.set(std, new Map());
          const pas = stds.get(std)!;
          if (!pas.has(pa)) pas.set(pa, new Map());
          const reqsMap = pas.get(pa)!;
          if (!reqsMap.has(reqLabel)) reqsMap.set(reqLabel, []);
          reqsMap.get(reqLabel)!.push(c);
        }
      }
    }
    return stds;
  })();
  const [editForm, setEditForm] = useState({
    name: assessment.name || "",
    activityTypeId: assessment.activityTypeId || "",
    loa: assessment.loa || "FirstLine",
    assessorId: assessment.assessorId || "",
    startDate: assessment.startDate ? new Date(assessment.startDate).toISOString().split("T")[0] : "",
    endDate: assessment.endDate ? new Date(assessment.endDate).toISOString().split("T")[0] : "",
    status: assessment.status || "Planned",
  });

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "controls" as const, label: "Control Assignment" },
    { key: "samples" as const, label: "Sample Selection" },
    { key: "findings" as const, label: "Finding & Actions" },
    { key: "activities" as const, label: "Activities" },
  ];

  const assignedControlIds = new Set(assessment.controlAssignments?.map((ca: any) => ca.controlId) ?? []);

  const handleToggleControl = async (controlId: string) => {
    setSaving(true);
    try {
      if (assignedControlIds.has(controlId)) {
        const ca = assessment.controlAssignments.find((c: any) => c.controlId === controlId);
        if (ca) {
          await fetch(`/api/admin/control-assignments/${ca.id}`, { method: "DELETE" });
        }
      } else {
        await fetch("/api/admin/control-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assessmentId: assessment.id, controlId }),
        });
      }
      router.refresh();
    } finally { setSaving(false); }
  };

  const handleSaveSample = async (sampleId: string, data: Record<string, any>) => {
    await fetch(`/api/admin/samples/${sampleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.refresh();
  };

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/table/Assessment/${assessment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditing(false);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally { setSaving(false); }
  };

  const handleAddSample = async () => {
    if (!sampleForm.sampleTypeId && !sampleForm.recordSourceId && !sampleForm.recordReference) {
      showToast("Please fill at least one field", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: assessment.id, ...sampleForm }),
      });
      if (!res.ok) throw new Error("Failed to add sample");
      setShowAddSample(false);
      setSampleForm({ sampleTypeId: "", recordSourceId: "", recordReference: "", comment: "" });
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add sample", "error");
    } finally { setSaving(false); }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!confirm("Delete this sample?")) return;
    await fetch(`/api/admin/samples/${sampleId}`, { method: "DELETE" });
    router.refresh();
  };

  const handleAddFinding = async () => {
    if (!findingForm.description.trim()) { showToast("Description is required", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: assessment.id,
          description: findingForm.description,
          severity: findingForm.severity,
          risks: findingForm.risks || null,
          details: findingForm.details || null,
          controlIds: [...findingForm.controlIds].join(", ") || null,
          repeat: findingForm.repeat || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to add finding");
      setShowAddFinding(false);
      setFindingForm({ description: "", severity: "Low", risks: "", details: "", repeat: false, controlIds: new Set<string>() });
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add finding", "error");
    } finally { setSaving(false); }
  };

  const handleDeleteFinding = async (findingId: string) => {
    if (!confirm("Delete this finding and all its actions?")) return;
    await fetch(`/api/admin/findings/${findingId}`, { method: "DELETE" });
    router.refresh();
  };

  const handleAddAction = async (findingId: string) => {
    const form = actionForms[findingId];
    if (!form?.description?.trim()) { showToast("Action description is required", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId,
          actionDescription: form.description,
          actionParty: form.party || null,
          actionDetails: form.details || null,
          targetDate: form.targetDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add action");
      setActionForms((prev) => { const next = { ...prev }; delete next[findingId]; return next; });
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add action", "error");
    } finally { setSaving(false); }
  };

  const handleDeleteAction = async (actionId: string) => {
    if (!confirm("Delete this action?")) return;
    await fetch(`/api/admin/actions/${actionId}`, { method: "DELETE" });
    router.refresh();
  };

  const toggleActionForm = (findingId: string) => {
    setActionForms((prev) => {
      if (prev[findingId]) { const next = { ...prev }; delete next[findingId]; return next; }
      return { ...prev, [findingId]: { description: "", party: "", details: "", targetDate: "" } };
    });
  };

  const handleComplete = async () => {
    if (!confirm("Mark this assessment as Complete? This will award gamification points.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/table/Assessment/${assessment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed", endDate: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Failed to complete");

      // Award points
      try {
        const awardRes = await fetch("/api/gamification/award", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, trigger: "assessment_complete", context: { assessmentId: assessment.id } }),
        });
        if (awardRes.ok) {
          const awardData = await awardRes.json();
          if (awardData.pointsAwarded) {
            showToast(`+${awardData.pointsAwarded} points! 🎉`, "success");
          }
          if (awardData.badgesAwarded?.length > 0) {
            for (const badge of awardData.badgesAwarded) {
              showToast(`🏆 Badge Unlocked: ${badge.name}!`, "info");
            }
          }
        }
      } catch { /* gamification optional */ }

      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to complete assessment", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/fla" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{assessment.name}</h1>
        <StatusBadge status={assessment.status} />
      </div>
      <p className="text-sm text-slate-500">{assessment.activityType?.name} · Assessor: {assessment.assessor?.name} · LOA: {assessment.loa}</p>

      <div className="mt-4 flex border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: Overview ─── */}
      {activeTab === "overview" && (
        <>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card padding="sm"><div className="text-2xl font-bold">{assignedControlIds.size}</div><div className="text-xs text-slate-500">Controls Assigned</div></Card>
          <Card padding="sm"><div className="text-2xl font-bold">{assessment.samples?.length ?? 0}</div><div className="text-xs text-slate-500">Samples</div></Card>
          <Card padding="sm"><div className="text-2xl font-bold">{assessment.findings?.length ?? 0}</div><div className="text-xs text-slate-500">Findings</div></Card>
          <Card padding="sm"><div className="text-2xl font-bold">{assessment.findings?.reduce((s: number, f: any) => s + (f.actions?.length ?? 0), 0) ?? 0}</div><div className="text-xs text-slate-500">Actions</div></Card>
        </div>

        {/* Editable Details */}
        <Card title="Assessment Details" padding="sm" className="mt-6">
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">Name</label>
                  <input type="text" value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Activity Type</label>
                  <select value={editForm.activityTypeId}
                    onChange={(e) => setEditForm({ ...editForm, activityTypeId: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                    {activityTypes.map((at) => <option key={at.id} value={at.id}>{at.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">LOA</label>
                  <select value={editForm.loa}
                    onChange={(e) => setEditForm({ ...editForm, loa: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                    <option value="FirstLine">First Line</option>
                    <option value="SecondLine">Second Line</option>
                    <option value="ThirdLine">Third Line</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Assessor</label>
                  <select value={editForm.assessorId}
                    onChange={(e) => setEditForm({ ...editForm, assessorId: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Start Date</label>
                  <input type="date" value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">End Date</label>
                  <input type="date" value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Status</label>
                  <select value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                    <option value="Planned">Planned</option>
                    <option value="InProgress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" disabled={saving} onClick={handleSaveDetails}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditForm({
                    name: assessment.name || "", activityTypeId: assessment.activityTypeId || "",
                    loa: assessment.loa || "FirstLine", assessorId: assessment.assessorId || "",
                    startDate: assessment.startDate ? new Date(assessment.startDate).toISOString().split("T")[0] : "",
                    endDate: assessment.endDate ? new Date(assessment.endDate).toISOString().split("T")[0] : "",
                    status: assessment.status || "Planned",
                  });
                  setEditing(false);
                }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="text-slate-500">Activity Type:</span> <span className="font-medium">{assessment.activityType?.name ?? "—"}</span></div>
                <div><span className="text-slate-500">LOA:</span> <span className="font-medium">{assessment.loa}</span></div>
                <div><span className="text-slate-500">Assessor:</span> <span className="font-medium">{assessment.assessor?.name ?? "—"}</span></div>
                <div><span className="text-slate-500">Status:</span> <StatusBadge status={assessment.status} /></div>
                <div><span className="text-slate-500">Start:</span> <span className="font-medium">{assessment.startDate ? new Date(assessment.startDate).toLocaleDateString() : "—"}</span></div>
                <div><span className="text-slate-500">End:</span> <span className="font-medium">{assessment.endDate ? new Date(assessment.endDate).toLocaleDateString() : "—"}</span></div>
              </div>
              <div className="pt-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>✏️ Edit Details</Button>
              </div>
            </div>
          )}
        </Card>

        {assessment.status !== "Completed" && (
          <div className="mt-6">
            <Button variant="success" disabled={saving} onClick={handleComplete}>
              {saving ? "Completing…" : "✅ Complete Assessment"}
            </Button>
            <p className="mt-2 text-xs text-slate-400">Marking complete awards points and may unlock badges.</p>
          </div>
        )}
        </>
      )}

      {/* ─── TAB 2: Control Assignment ─── */}
      {activeTab === "controls" && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Select Controls" padding="sm">
            <div className="max-h-[60vh] overflow-y-auto">
              {[...groupedControls.entries()].map(([std, pas]) => {
                const stdKey = `std:${std}`;
                const stdCollapsed = !expandedGroups.has(stdKey);
                const stdTotal = [...pas.values()].reduce((s, reqs) => s + [...reqs.values()].reduce((s2, cs) => s2 + cs.length, 0), 0);
                return (
                  <div key={stdKey} className="border-b border-slate-100 last:border-0">
                    <button
                      onClick={() => toggleGroup(stdKey)}
                      className="w-full flex items-center justify-between px-2 py-2 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-sm font-semibold text-slate-700">{std}</span>
                      <span className="text-xs text-slate-400">{stdCollapsed ? "▶" : "▼"} {stdTotal}</span>
                    </button>
                    {!stdCollapsed && (
                      <div className="pl-2">
                        {[...pas.entries()].map(([pa, reqs]) => {
                          const paKey = `pa:${std}:${pa}`;
                          const paCollapsed = !expandedGroups.has(paKey);
                          const paTotal = [...reqs.values()].reduce((s, cs) => s + cs.length, 0);
                          return (
                            <div key={paKey} className="ml-2 border-l-2 border-slate-100">
                              <button
                                onClick={() => toggleGroup(paKey)}
                                className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:bg-slate-50 transition-colors"
                              >
                                <span className="text-xs font-medium text-slate-600">{pa}</span>
                                <span className="text-xs text-slate-400">{paCollapsed ? "▶" : "▼"} {paTotal}</span>
                              </button>
                              {!paCollapsed && (
                                <div className="ml-2">
                                  {[...reqs.entries()].map(([reqLabel, controls]) => {
                                    const reqKey = `req:${std}:${pa}:${reqLabel}`;
                                    const reqCollapsed = !expandedGroups.has(reqKey);
                                    const isUnmapped = reqLabel === "__unmapped__";
                                    return (
                                      <div key={reqKey}>
                                        {!isUnmapped && (
                                          <button
                                            onClick={() => toggleGroup(reqKey)}
                                            className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-slate-50 transition-colors"
                                          >
                                            <span className="text-xs text-slate-500 truncate max-w-70">{reqLabel}</span>
                                            <span className="text-xs text-slate-400 ml-1 shrink-0">{reqCollapsed ? "▶" : "▼"} {controls.length}</span>
                                          </button>
                                        )}
                                        {(!isUnmapped && !reqCollapsed || isUnmapped) && (
                                          <div className={isUnmapped ? "" : "ml-3"}>
                                            {controls.map((c: any) => {
                                              const checked = assignedControlIds.has(c.id);
                                              return (
                                                <label key={c.id}
                                                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-50 text-xs ${checked ? "bg-blue-50" : ""}`}>
                                                  <input type="checkbox" checked={checked}
                                                    onChange={() => handleToggleControl(c.id)} disabled={saving}
                                                    className="rounded text-blue-600 shrink-0" />
                                                  <span className="flex-1 truncate">{c.name}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title={`Assigned Controls (${assignedControlIds.size})`} padding="sm">
            {assignedControlIds.size === 0 ? (
              <p className="text-sm text-slate-400">No controls assigned yet.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto space-y-2">
                {assessment.controlAssignments?.map((ca: any) => (
                  <div key={ca.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{ca.control?.name}</div>
                      <div className="text-xs text-slate-500">{ca.control?.processArea?.name}</div>
                    </div>
                    <select
                      value={ca.effective ?? ""}
                      onChange={async (e) => {
                        await fetch(`/api/admin/control-assignments/${ca.id}`, {
                          method: "PUT", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ effective: e.target.value || null }),
                        });
                        router.refresh();
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      <option value="Effective">Effective</option>
                      <option value="NotEffective">Not Effective</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── TAB 3: Samples ─── */}
      {activeTab === "samples" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">{assessment.samples?.length ?? 0} Sample(s)</h3>
            <Button variant="primary" size="sm" onClick={() => setShowAddSample(true)}>+ Add Sample</Button>
          </div>

          {/* Add Sample Modal */}
          {showAddSample && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddSample(false)}>
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-semibold mb-4">Add Sample</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Sample Type</label>
                    <select value={sampleForm.sampleTypeId} onChange={(e) => setSampleForm({ ...sampleForm, sampleTypeId: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                      <option value="">— Select —</option>
                      {sampleTypes.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Record Source</label>
                    <select value={sampleForm.recordSourceId} onChange={(e) => setSampleForm({ ...sampleForm, recordSourceId: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                      <option value="">— Select —</option>
                      {recordSources.map((rs) => <option key={rs.id} value={rs.id}>{rs.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Reference (e.g. document #)</label>
                    <input type="text" value={sampleForm.recordReference}
                      onChange={(e) => setSampleForm({ ...sampleForm, recordReference: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" placeholder="PO-2026-001" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Notes</label>
                    <textarea value={sampleForm.comment}
                      onChange={(e) => setSampleForm({ ...sampleForm, comment: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={2} placeholder="Optional notes..." />
                  </div>
                </div>
                <div className="flex gap-2 mt-4 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddSample(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" disabled={saving} onClick={handleAddSample}>
                    {saving ? "Adding…" : "Add Sample"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {assessment.samples?.length === 0 && !showAddSample ? (
            <p className="py-12 text-center text-sm text-slate-400">No samples recorded. Click "+ Add Sample" to begin.</p>
          ) : (
            assessment.samples?.map((s: any) => (
              <Card key={s.id} padding="sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-sm font-medium text-slate-800">
                    {s.sampleType?.name ?? "Sample"} {s.recordReference ? `· ${s.recordReference}` : ""}
                  </div>
                  <button onClick={() => handleDeleteSample(s.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors" title="Delete sample">
                    🗑
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Type</label>
                    <p className="text-sm">{s.sampleType?.name ?? s.sampleTypeId ?? "—"}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Status</label>
                    <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Sample status">
                      {["NotTested", "InProgress", "Tested"].map((status) => (
                        <button
                          key={status}
                          onClick={() => handleSaveSample(s.id, { status })}
                          className={`flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors touch-manipulation ${
                            s.status === status
                              ? status === "Tested" ? "bg-emerald-700 text-white" : status === "InProgress" ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-700"
                              : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200"
                          }`}
                          role="radio"
                          aria-checked={s.status === status}
                        >
                          {status === "NotTested" ? "◯ Not Tested" : status === "InProgress" ? "◐ In Progress" : "● Tested"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Conclusion</label>
                    <select
                      value={s.conclusion ?? ""}
                      onChange={(e) => handleSaveSample(s.id, { conclusion: e.target.value || null })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm mt-1"
                    >
                      <option value="">—</option>
                      <option value="Effective">Effective</option>
                      <option value="NotEffective">Not Effective</option>
                      <option value="NotApplicable">Not Applicable</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Notes</label>
                    <input
                      type="text"
                      value={s.notes ?? ""}
                      onChange={(e) => handleSaveSample(s.id, { notes: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm mt-1"
                      placeholder="Optional notes"
                    />
                    <div className="mt-1">
                      <VoiceInput
                        value={s.notes ?? ""}
                        onResult={(text) => handleSaveSample(s.id, { notes: text })}
                        placeholder="Describe the sample…"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ─── TAB 4: Findings ─── */}
      {activeTab === "findings" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700">{assessment.findings?.length ?? 0} Finding(s)</h3>
            <Button variant="primary" size="sm" onClick={() => setShowAddFinding(true)}>+ Add Finding</Button>
          </div>

          {/* Add Finding Modal */}
          {showAddFinding && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddFinding(false)}>
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-semibold mb-4">Add Finding</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Description *</label>
                    <textarea value={findingForm.description}
                      onChange={(e) => setFindingForm({ ...findingForm, description: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={3}
                      placeholder="Describe the finding..." autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Severity</label>
                      <select value={findingForm.severity}
                        onChange={(e) => setFindingForm({ ...findingForm, severity: e.target.value })}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1">
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Serious">Serious</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Repeat Finding</label>
                      <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                        <input type="checkbox" checked={findingForm.repeat as unknown as boolean ?? false}
                          onChange={(e) => setFindingForm({ ...findingForm, repeat: e.target.checked as any })}
                          className="rounded text-blue-600" />
                        <span className="text-sm text-slate-700">This is a repeat finding</span>
                      </label>
                    </div>
                  </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Linked Controls</label>
                      <div className="mt-1 max-h-32 overflow-y-auto border border-slate-200 rounded p-2 space-y-0.5">
                        {assessment.controlAssignments?.length > 0 ? (
                          assessment.controlAssignments.map((ca: any) => {
                            const cid = ca.controlId;
                            const cname = ca.control?.name ?? cid;
                            const checked = findingForm.controlIds.has(cid);
                            return (
                              <label key={cid} className={`flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer hover:bg-slate-50 text-xs ${checked ? "bg-blue-50" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setFindingForm((prev) => {
                                      const next = new Set(prev.controlIds);
                                      if (next.has(cid)) next.delete(cid); else next.add(cid);
                                      return { ...prev, controlIds: next };
                                    });
                                  }}
                                  className="rounded text-blue-600 shrink-0"
                                />
                                <span className="truncate">{cname}</span>
                              </label>
                            );
                          })
                        ) : (
                          <p className="text-xs text-slate-400 py-1 px-1">No controls assigned to this assessment yet.</p>
                        )}
                      </div>
                      {findingForm.controlIds.size > 0 && (
                        <p className="text-xs text-slate-400 mt-1">{findingForm.controlIds.size} control(s) selected</p>
                      )}
                    </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Risks</label>
                    <textarea value={findingForm.risks}
                      onChange={(e) => setFindingForm({ ...findingForm, risks: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={2}
                      placeholder="What are the risks if not addressed?" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Details</label>
                    <textarea value={findingForm.details}
                      onChange={(e) => setFindingForm({ ...findingForm, details: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1" rows={2}
                      placeholder="Additional details..." />
                  </div>
                </div>
                <div className="flex gap-2 mt-4 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddFinding(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" disabled={saving} onClick={handleAddFinding}>
                    {saving ? "Adding…" : "Add Finding"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {assessment.findings?.length === 0 && !showAddFinding ? (
            <p className="py-12 text-center text-sm text-slate-400">No findings recorded. Click "+ Add Finding" to begin.</p>
          ) : (
            assessment.findings?.map((f: any) => (
              <Card key={f.id} padding="sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">{f.id}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      f.severity === "Serious" ? "bg-red-100 text-red-800" :
                      f.severity === "High" ? "bg-orange-100 text-orange-800" :
                      f.severity === "Medium" ? "bg-amber-100 text-amber-800" :
                      "bg-slate-100 text-slate-600"
                    }`}>{f.severity}</span>
                    {f.repeat && <span className="text-xs text-amber-600">🔄 Repeat</span>}
                  </div>
                  <button onClick={() => handleDeleteFinding(f.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors" title="Delete finding">🗑</button>
                </div>
                <p className="text-sm text-slate-800 mb-2">{f.description}</p>
                {f.risks && <p className="text-xs text-slate-500 mb-1"><strong>Risks:</strong> {f.risks}</p>}
                {f.controlIds && <p className="text-xs text-slate-500 mb-2"><strong>Controls:</strong> {f.controlIds}</p>}

                {/* Actions sub-section */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500">Actions ({(f.actions?.length ?? 0)})</span>
                    <button onClick={() => toggleActionForm(f.id)}
                      className="text-xs text-blue-600 hover:text-blue-800">
                      {actionForms[f.id] ? "Cancel" : "+ Add Action"}
                    </button>
                  </div>

                  {/* Add Action inline form */}
                  {actionForms[f.id] && (
                    <div className="mb-3 p-3 bg-slate-50 rounded-md space-y-2">
                      <input type="text" value={actionForms[f.id].description}
                        onChange={(e) => setActionForms({ ...actionForms, [f.id]: { ...actionForms[f.id], description: e.target.value } })}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="Action description *" autoFocus />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={actionForms[f.id].party}
                          onChange={(e) => setActionForms({ ...actionForms, [f.id]: { ...actionForms[f.id], party: e.target.value } })}
                          className="rounded border border-slate-300 px-2 py-1.5 text-xs" placeholder="Responsible party" />
                        <input type="date" value={actionForms[f.id].targetDate}
                          onChange={(e) => setActionForms({ ...actionForms, [f.id]: { ...actionForms[f.id], targetDate: e.target.value } })}
                          className="rounded border border-slate-300 px-2 py-1.5 text-xs" />
                      </div>
                      <textarea value={actionForms[f.id].details}
                        onChange={(e) => setActionForms({ ...actionForms, [f.id]: { ...actionForms[f.id], details: e.target.value } })}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" rows={1} placeholder="Details (optional)" />
                      <Button variant="primary" size="sm" disabled={saving} onClick={() => handleAddAction(f.id)}>
                        {saving ? "Adding…" : "Save Action"}
                      </Button>
                    </div>
                  )}

                  {/* Existing actions */}
                  {f.actions?.map((act: any) => (
                    <div key={act.id} className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-800 truncate">{act.actionDescription}</span>
                          {act.actionClosureEffective && <span className="text-xs text-emerald-600">✓ Closed</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                          {act.actionParty && <span>{act.actionParty}</span>}
                          {act.targetDate && <span> · Due: {new Date(act.targetDate).toLocaleDateString()}</span>}
                          {act.apAgreed && <span> · Agreed</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteAction(act.id)}
                        className="text-xs text-red-400 hover:text-red-600 ml-2 shrink-0">🗑</button>
                    </div>
                  ))}
                  {(!f.actions || f.actions.length === 0) && !actionForms[f.id] && (
                    <p className="text-xs text-slate-400 py-1">No actions yet.</p>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ─── TAB 5: Activities ─── */}
      {activeTab === "activities" && (
        <div className="mt-6">
          <AssessmentActivitiesPanel
            assessmentId={assessment.id}
            users={users}
            availableControls={assessment.controlAssignments?.map((ca: any) => ({ id: ca.controlId, name: ca.control?.name ?? ca.controlId })) ?? []}
          />
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button variant="secondary" size="sm" onClick={() => router.push("/fla")}>← Back</Button>
      </div>
    </div>
  );
}
