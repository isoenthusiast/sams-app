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

type Props = {
  assessment: any;
  allControls: any[];
  processAreas: Array<{ id: string; name: string }>;
  currentUserId?: string;
};

export default function AssessmentClient({ assessment, allControls, processAreas, currentUserId }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "controls" | "samples" | "findings" | "activities">("overview");
  const [saving, setSaving] = useState(false);

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
            <div className="max-h-[60vh] overflow-y-auto space-y-1">
              {allControls.map((c: any) => {
                const checked = assignedControlIds.has(c.id);
                return (
                  <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-slate-50 text-sm ${checked ? "bg-blue-50" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => handleToggleControl(c.id)} disabled={saving} className="rounded text-blue-600" />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-slate-400">{c.processArea?.name}</span>
                  </label>
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
          {assessment.samples?.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No samples recorded.</p>
          ) : (
            assessment.samples?.map((s: any) => (
              <Card key={s.id} padding="sm">
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
          {assessment.findings?.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No findings recorded.</p>
          ) : (
            assessment.findings?.map((f: any) => (
              <FindingCard
                key={f.id}
                id={f.id}
                description={f.description}
                severity={f.severity}
                risks={f.risks}
                actions={f.actions?.map((act: any) => ({
                  id: act.id,
                  actionDescription: act.actionDescription,
                  actionParty: act.actionParty,
                  actionClosureEffective: act.actionClosureEffective,
                })) ?? []}
              />
            ))
          )}
        </div>
      )}

      {/* ─── TAB 5: Activities ─── */}
      {activeTab === "activities" && (
        <div className="mt-6 space-y-3">
          {assessment.aacts?.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No activities scheduled.</p>
          ) : (
            assessment.aacts?.map((act: any) => (
              <Card key={act.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-slate-900">{act.activityName}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(act.activityDate).toLocaleDateString()} · {act.activityStartTime}–{act.activityEndTime}
                    </div>
                    {act.activityDescription && <p className="text-xs text-slate-600 mt-1">{act.activityDescription}</p>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {act.controls?.length ?? 0} control(s) · {act.users?.length ?? 0} participant(s)
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button variant="secondary" size="sm" onClick={() => router.push("/fla")}>← Back</Button>
      </div>
    </div>
  );
}
