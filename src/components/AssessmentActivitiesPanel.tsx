"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AttachmentList } from "@/components/AttachmentList";
import { showToast } from "@/components/Toast";

interface AactRecord {
  id: string;
  aaID: string;
  assuranceID: string;
  assacttypeid: string;
  activityName: string;
  activityDate: string;
  activityStartTime: string;
  activityEndTime: string;
  activityDuration: string | null;
  activityDescription: string | null;
  createdAt: string;
  controls: Array<{
    id: string;
    controlId: string;
    control: { id: string; name: string } | null;
  }>;
  users: Array<{
    id: string;
    userId: string;
    userRoles: string;
    assignmentRemarks: string | null;
    user: { id: string; name: string | null; username: string } | null;
  }>;
  details: Array<{
    id: string;
    checklists: string | null;
    activityNotes: string | null;
  }>;
}

const TYPE_LABELS: Record<string, string> = {
  ACT: "Interview",
  ACT_DOC: "Document Review",
  ACT_SITE: "Site Visit",
};

const TYPE_OPTIONS = [
  { value: "ACT", label: "Interview" },
  { value: "ACT_DOC", label: "Document Review" },
  { value: "ACT_SITE", label: "Site Visit" },
];

const SUB_TABS = [
  { id: "users" as const, label: "Participants" },
  { id: "details" as const, label: "Details" },
  { id: "controls" as const, label: "Controls" },
];

interface Props {
  assessmentId: string;
  users: Array<{
    id: string;
    name: string | null;
    username?: string;
    role: string;
  }>;
  availableControls: Array<{ id: string; name: string }>;
  readOnly?: boolean;
}

export default function AssessmentActivitiesPanel({
  assessmentId,
  users,
  availableControls,
  readOnly = false,
}: Props) {
  const [activities, setActivities] = useState<AactRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"users" | "details" | "controls">(
    "users",
  );
  const [loading, setLoading] = useState(false);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    assacttypeid: "ACT",
    activityName: "",
    activityDate: new Date().toISOString().slice(0, 10),
    activityStartTime: "09:00",
    activityEndTime: "10:00",
    activityDuration: "1h",
    activityDescription: "",
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    activityName: "",
    activityDate: "",
    activityStartTime: "",
    activityEndTime: "",
    activityDuration: "",
    activityDescription: "",
    assacttypeid: "ACT",
    checklists: "",
    activityNotes: "",
  });

  // Users sub-tab state
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoles, setAssignRoles] = useState("");
  const [assignRemarks, setAssignRemarks] = useState("");

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/activities?assessmentId=${assessmentId}`,
      );
      const d = await res.json();
      setActivities(d.activities || []);
    } catch {
      showToast("Failed to load activities", "error");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // Load edit form data when activity selected
  useEffect(() => {
    if (!selectedId) return;
    const act = activities.find((a) => a.id === selectedId);
    if (!act) return;
    setEditForm({
      activityName: act.activityName || "",
      activityDate: act.activityDate ? act.activityDate.slice(0, 10) : "",
      activityStartTime: act.activityStartTime || "",
      activityEndTime: act.activityEndTime || "",
      activityDuration: act.activityDuration || "",
      activityDescription: act.activityDescription || "",
      assacttypeid: act.assacttypeid || "ACT",
      checklists: act.details?.[0]?.checklists || "",
      activityNotes: act.details?.[0]?.activityNotes || "",
    });
  }, [selectedId, activities]);

  const handleAdd = async () => {
    try {
      const res = await fetch("/api/admin/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assuranceID: assessmentId,
          ...addForm,
          activityDate: new Date(addForm.activityDate).toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to create activity");
      setShowAdd(false);
      setAddForm({
        assacttypeid: "ACT",
        activityName: "",
        activityDate: new Date().toISOString().slice(0, 10),
        activityStartTime: "09:00",
        activityEndTime: "10:00",
        activityDuration: "1h",
        activityDescription: "",
      });
      showToast("Activity created", "success");
      loadActivities();
    } catch {
      showToast("Failed to create activity", "error");
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/admin/activities/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          activityDate: editForm.activityDate
            ? new Date(editForm.activityDate).toISOString()
            : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to update activity");

      // Save details
      await fetch("/api/admin/activity-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aaId: selectedId,
          checklists: editForm.checklists,
          activityNotes: editForm.activityNotes,
        }),
      });

      showToast("Activity updated", "success");
      loadActivities();
    } catch {
      showToast("Failed to update activity", "error");
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (
      !confirm(
        "Delete this activity and all its participants, controls, and details?",
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/activities/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete activity");
      if (selectedId === id) setSelectedId(null);
      showToast("Activity deleted", "success");
      loadActivities();
    } catch {
      showToast("Failed to delete activity", "error");
    }
  };

  const handleAssignUser = async () => {
    if (!selectedId || !assignUserId || !assignRoles) return;
    try {
      const res = await fetch("/api/admin/activity-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aaId: selectedId,
          userId: assignUserId,
          userRoles: assignRoles,
          assignmentRemarks: assignRemarks,
        }),
      });
      if (res.status === 409) {
        showToast("User is already assigned to this activity", "error");
        return;
      }
      if (!res.ok) throw new Error("Failed to assign user");
      setAssignUserId("");
      setAssignRoles("");
      setAssignRemarks("");
      showToast("Participant assigned", "success");
      loadActivities();
    } catch {
      showToast("Failed to assign participant", "error");
    }
  };

  const handleRemoveUser = async (userAssignmentId: string) => {
    if (!confirm("Remove this participant?")) return;
    try {
      const res = await fetch(`/api/admin/activity-users/${userAssignmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove user");
      loadActivities();
    } catch {
      showToast("Failed to remove participant", "error");
    }
  };

  const handleAddControl = async (controlId: string) => {
    if (!selectedId) return;
    try {
      const res = await fetch("/api/admin/activity-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aaId: selectedId, controlId }),
      });
      if (!res.ok) throw new Error("Failed to map control");
      loadActivities();
    } catch {
      showToast("Failed to map control", "error");
    }
  };

  const handleRemoveControl = async (mappingId: string) => {
    try {
      const res = await fetch(`/api/admin/activity-controls/${mappingId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unmap control");
      loadActivities();
    } catch {
      showToast("Failed to unmap control", "error");
    }
  };

  const selectedActivity = activities.find((a) => a.id === selectedId);
  const assignedControlIds = new Set(
    selectedActivity?.controls.map((c) => c.controlId) ?? [],
  );
  const unassignedControls = availableControls.filter(
    (c) => !assignedControlIds.has(c.id),
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full min-h-100">
      {/* LEFT: Activity List */}
      <Card className="w-full md:w-72 shrink-0 flex flex-col p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Activities
          </div>
          {!readOnly && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={() => setShowAdd(true)}
            >
              + Add Activity
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-xs text-slate-400">Loading...</div>
          ) : activities.length === 0 ? (
            <div className="p-3 text-xs text-slate-400">No activities yet.</div>
          ) : (
            activities.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setSelectedId(a.id);
                  setSubTab("users");
                }}
                className={`w-full text-left px-3 py-2 text-xs border-b border-slate-50 hover:bg-slate-50 ${
                  selectedId === a.id
                    ? "bg-blue-50 border-l-2 border-l-blue-500 font-medium"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{a.activityName}</span>
                  <span className="text-2xs text-slate-400 ml-1 shrink-0">
                    {TYPE_LABELS[a.assacttypeid] || a.assacttypeid}
                  </span>
                </div>
                <div className="text-2xs text-slate-400 mt-0.5">
                  {a.activityDate
                    ? new Date(a.activityDate).toLocaleDateString()
                    : ""}{" "}
                  · {a.activityStartTime}–{a.activityEndTime}
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* RIGHT: Sub-tabs */}
      <Card className="flex-1 flex flex-col min-w-0 p-0 overflow-hidden">
        {!selectedActivity ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm p-6">
            ← Select an activity or add a new one
          </div>
        ) : (
          <>
            <div className="flex border-b border-slate-200 bg-slate-50 px-2">
              {SUB_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSubTab(t.id)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 ${
                    subTab === t.id
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <div className="flex-1" />
              {!readOnly && (
                <button
                  onClick={() => handleDeleteActivity(selectedId!)}
                  className="px-2 py-1 text-2xs text-red-500 hover:text-red-700 self-center"
                >
                  Delete Activity
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {subTab === "users" && (
                <div className="space-y-4 max-w-2xl">
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      {selectedActivity.activityName}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-500">
                      <div>
                        Type:{" "}
                        <span className="text-slate-700">
                          {TYPE_LABELS[selectedActivity.assacttypeid] ||
                            selectedActivity.assacttypeid}
                        </span>
                      </div>
                      <div>
                        Date:{" "}
                        <span className="text-slate-700">
                          {selectedActivity.activityDate
                            ? new Date(
                                selectedActivity.activityDate,
                              ).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      <div>
                        Time:{" "}
                        <span className="text-slate-700">
                          {selectedActivity.activityStartTime} –{" "}
                          {selectedActivity.activityEndTime}
                        </span>
                      </div>
                      <div>
                        Duration:{" "}
                        <span className="text-slate-700">
                          {selectedActivity.activityDuration || "—"}
                        </span>
                      </div>
                    </div>
                    {selectedActivity.activityDescription && (
                      <div className="mt-2 text-xs text-slate-500 border-t border-slate-200 pt-2">
                        {selectedActivity.activityDescription}
                      </div>
                    )}
                  </div>

                  <div className="rounded border border-slate-200">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                      Assigned Participants
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="flex items-end gap-2 flex-wrap">
                        <label className="block flex-1 min-w-30">
                          <span className="text-2xs text-slate-500">User</span>
                          <select
                            value={assignUserId}
                            onChange={(e) => setAssignUserId(e.target.value)}
                            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white"
                          >
                            <option value="">— Select —</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name || u.username}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block flex-1 min-w-25">
                          <span className="text-2xs text-slate-500">Role</span>
                          <input
                            value={assignRoles}
                            onChange={(e) => setAssignRoles(e.target.value)}
                            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            placeholder="e.g. Interviewer"
                          />
                        </label>
                        <label className="block flex-1 min-w-25">
                          <span className="text-2xs text-slate-500">
                            Remarks
                          </span>
                          <input
                            value={assignRemarks}
                            onChange={(e) => setAssignRemarks(e.target.value)}
                            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            placeholder="Optional"
                          />
                        </label>
                        {!readOnly && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleAssignUser}
                          >
                            + Add
                          </Button>
                        )}
                      </div>

                      {selectedActivity.users.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">
                          No participants assigned.
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-2 py-1 text-left font-medium text-slate-600">
                                User
                              </th>
                              <th className="px-2 py-1 text-left font-medium text-slate-600">
                                Role
                              </th>
                              <th className="px-2 py-1 text-left font-medium text-slate-600">
                                Remarks
                              </th>
                              <th className="px-2 py-1 w-16"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedActivity.users.map((au) => (
                              <tr
                                key={au.id}
                                className="border-t border-slate-100"
                              >
                                <td className="px-2 py-1">
                                  {au.user?.name ||
                                    au.user?.username ||
                                    au.userId}
                                </td>
                                <td className="px-2 py-1">
                                  {au.userRoles || "—"}
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {au.assignmentRemarks || "—"}
                                </td>
                                <td className="px-2 py-1">
                                  {!readOnly && (
                                    <button
                                      onClick={() => handleRemoveUser(au.id)}
                                      className="text-red-500 hover:text-red-700 text-2xs"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {subTab === "details" && (
                <div className="space-y-3 max-w-lg">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-slate-500">
                        Activity Type
                      </span>
                      <select
                        value={editForm.assacttypeid}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            assacttypeid: e.target.value,
                          }))
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white"
                      >
                        {TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">Date</span>
                      <input
                        type="date"
                        value={editForm.activityDate}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            activityDate: e.target.value,
                          }))
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-slate-500">
                      Activity Name
                    </span>
                    <input
                      value={editForm.activityName}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          activityName: e.target.value,
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-xs text-slate-500">Start</span>
                      <input
                        type="time"
                        value={editForm.activityStartTime}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            activityStartTime: e.target.value,
                          }))
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">End</span>
                      <input
                        type="time"
                        value={editForm.activityEndTime}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            activityEndTime: e.target.value,
                          }))
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">Duration</span>
                      <input
                        value={editForm.activityDuration || ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            activityDuration: e.target.value,
                          }))
                        }
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        placeholder="e.g. 1h"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-slate-500">Description</span>
                    <textarea
                      value={editForm.activityDescription || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          activityDescription: e.target.value,
                        }))
                      }
                      rows={3}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">Checklists</span>
                    <textarea
                      value={editForm.checklists || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          checklists: e.target.value,
                        }))
                      }
                      rows={3}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="Checklist items for this activity..."
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">
                      Activity Notes
                    </span>
                    <textarea
                      value={editForm.activityNotes || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          activityNotes: e.target.value,
                        }))
                      }
                      rows={3}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="General notes about this activity..."
                    />
                  </label>

                  <AttachmentList destTable="Aact" recId={selectedId!} />

                  {!readOnly && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveEdit}
                    >
                      Save Changes
                    </Button>
                  )}
                </div>
              )}

              {subTab === "controls" && (
                <div className="space-y-4 max-w-2xl">
                  <div className="rounded border border-slate-200">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                      Mapped Controls ({selectedActivity.controls.length})
                    </div>
                    {selectedActivity.controls.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 italic">
                        No controls mapped yet.
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium text-slate-600">
                              Control
                            </th>
                            <th className="px-2 py-1 w-16"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedActivity.controls.map((ac) => (
                            <tr
                              key={ac.id}
                              className="border-t border-slate-100"
                            >
                              <td className="px-2 py-1">
                                {ac.control?.name || ac.controlId}
                              </td>
                              <td className="px-2 py-1">
                                {!readOnly && (
                                  <button
                                    onClick={() => handleRemoveControl(ac.id)}
                                    className="text-red-500 hover:text-red-700 text-2xs"
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="rounded border border-slate-200">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                      Available Controls ({unassignedControls.length})
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {unassignedControls.slice(0, 100).map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-slate-50 hover:bg-slate-50"
                        >
                          <span className="truncate flex-1 mr-2">{c.name}</span>
                          {!readOnly && (
                            <button
                              onClick={() => handleAddControl(c.id)}
                              className="text-green-600 hover:text-green-700 text-2xs shrink-0"
                            >
                              + Map
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Add Activity Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">
                New Assessment Activity
              </h3>
              <button
                onClick={() => setShowAdd(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-slate-500">Activity Type</span>
                <select
                  value={addForm.assacttypeid}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, assacttypeid: e.target.value }))
                  }
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Activity Name</span>
                <input
                  value={addForm.activityName}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, activityName: e.target.value }))
                  }
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. Kickoff Interview"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Date</span>
                <input
                  type="date"
                  value={addForm.activityDate}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, activityDate: e.target.value }))
                  }
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-xs text-slate-500">Start</span>
                  <input
                    type="time"
                    value={addForm.activityStartTime}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        activityStartTime: e.target.value,
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">End</span>
                  <input
                    type="time"
                    value={addForm.activityEndTime}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        activityEndTime: e.target.value,
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">Duration</span>
                  <input
                    value={addForm.activityDuration}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        activityDuration: e.target.value,
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="e.g. 1h"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-slate-500">Description</span>
                <textarea
                  value={addForm.activityDescription}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      activityDescription: e.target.value,
                    }))
                  }
                  rows={2}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={handleAdd}
                >
                  Create Activity
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
