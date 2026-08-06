"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

interface ControlItem {
  id: string;
  name: string;
  processArea?: { id: string; name: string } | null;
  requirementMappings?: Array<{ requirement: { rID: number; requirementId: string; clauseContent: string | null } }>;
  assignmentId?: string;
  effectiveness?: string | null;
}

interface RequirementInfo {
  rID: number;
  requirementId: string;
  clauseContent: string | null;
}

interface Props {
  assessmentId: string;
  assignedControls: ControlItem[];
  onRefresh: () => void;
}

export default function RequirementControlPanel({ assessmentId, assignedControls, onRefresh }: Props) {
  const [available, setAvailable] = useState<ControlItem[]>([]);
  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(new Set());
  const [selectedAssigned, setSelectedAssigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [dragOver, setDragOver] = useState<"left" | "right" | null>(null);

  // Load available controls (not yet assigned)
  useEffect(() => {
    fetch(`/api/admin/assessments/${assessmentId}/controls?mode=available`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAvailable(data);
      })
      .catch(() => {});
  }, [assessmentId, assignedControls.length]);

  const assignedIds = new Set(assignedControls.map(c => c.id));

  const filtered = available.filter(c =>
    !assignedIds.has(c.id) &&
    (filter === "" || c.name.toLowerCase().includes(filter.toLowerCase()) ||
     c.processArea?.name?.toLowerCase().includes(filter.toLowerCase()))
  );

  const toggleAvailable = (id: string) => {
    setSelectedAvailable(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAssigned = (id: string) => {
    setSelectedAssigned(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const assignSelected = async () => {
    if (selectedAvailable.size === 0) return;
    setLoading(true);
    const ids = Array.from(selectedAvailable);
    const res = await fetch(`/api/admin/assessments/${assessmentId}/controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlIds: ids }),
    });
    if (res.ok) {
      showToast(`Assigned ${ids.length} control(s)`, "success");
      setSelectedAvailable(new Set());
      onRefresh();
    } else {
      const err = await res.json();
      showToast(err.error || "Failed", "error");
    }
    setLoading(false);
  };

  const removeSelected = async () => {
    if (selectedAssigned.size === 0) return;
    setLoading(true);
    // Find assignment IDs for the selected controls
    const toRemove = assignedControls
      .filter(c => selectedAssigned.has(c.id))
      .map(c => c.assignmentId)
      .filter(Boolean);
    
    let removed = 0;
    for (const aid of toRemove) {
      const res = await fetch(`/api/admin/control-assignments/${aid}`, { method: "DELETE" });
      if (res.ok) removed++;
    }
    if (removed > 0) {
      showToast(`Removed ${removed} control(s)`, "success");
      setSelectedAssigned(new Set());
      onRefresh();
    }
    setLoading(false);
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, id: string, source: "available" | "assigned") => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id, source }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, target: "left" | "right") => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(target);
  };

  const handleDragLeave = () => setDragOver(null);

  const handleDrop = async (e: React.DragEvent, target: "left" | "right") => {
    e.preventDefault();
    setDragOver(null);
    try {
      const { id, source } = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (source === target) return; // Same side, no-op
      
      if (target === "right" && source === "available") {
        // Assign single control
        setLoading(true);
        const res = await fetch(`/api/admin/assessments/${assessmentId}/controls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controlIds: [id] }),
        });
        if (res.ok) { showToast("Control assigned", "success"); onRefresh(); }
        else { const err = await res.json(); showToast(err.error || "Failed", "error"); }
        setLoading(false);
      } else if (target === "left" && source === "assigned") {
        // Remove single control
        const ctrl = assignedControls.find(c => c.id === id);
        if (ctrl?.assignmentId) {
          setLoading(true);
          const res = await fetch(`/api/admin/control-assignments/${ctrl.assignmentId}`, { method: "DELETE" });
          if (res.ok) { showToast("Control removed", "success"); onRefresh(); }
          else showToast("Failed to remove", "error");
          setLoading(false);
        }
      }
    } catch { /* ignore parse errors */ }
  };

  // Derived: unique requirements from assigned controls
  const reqMap = new Map<number, RequirementInfo>();
  for (const c of assignedControls) {
    for (const m of (c.requirementMappings || [])) {
      if (!reqMap.has(m.requirement.rID)) {
        reqMap.set(m.requirement.rID, m.requirement);
      }
    }
  }
  const requirements = Array.from(reqMap.values());

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* LEFT: Available Controls */}
      <div
        className={`rounded-lg border-2 transition-colors ${dragOver === "left" ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
        onDragOver={(e) => handleDragOver(e, "left")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, "left")}
      >
        <div className="border-b border-slate-100 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Available Controls</span>
            <span className="text-xs text-slate-400">{filtered.length}</span>
          </div>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter controls..."
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-slate-400">No available controls</p>
          ) : (
            filtered.map(c => (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => handleDragStart(e, c.id, "available")}
                onClick={() => toggleAvailable(c.id)}
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-slate-50 ${
                  selectedAvailable.has(c.id) ? "bg-blue-100 ring-1 ring-blue-300" : ""
                }`}
              >
                <input type="checkbox" checked={selectedAvailable.has(c.id)} readOnly className="h-3 w-3 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{c.name}</div>
                  {c.processArea && (
                    <div className="truncate text-slate-400">{c.processArea.name}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT: Selected Requirements + Assigned Controls */}
      <div
        className={`rounded-lg border-2 transition-colors ${dragOver === "right" ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
        onDragOver={(e) => handleDragOver(e, "right")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, "right")}
      >
        {/* Top: Requirements */}
        <div className="border-b border-slate-100 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Selected Requirements</span>
            <span className="text-xs text-slate-400">{requirements.length}</span>
          </div>
        </div>
        <div className="max-h-32 overflow-y-auto border-b border-slate-100 p-1">
          {requirements.length === 0 ? (
            <p className="px-2 py-2 text-center text-xs text-slate-400">Assign controls to see requirements</p>
          ) : (
            requirements.map(r => (
              <div key={r.rID} className="rounded px-2 py-1 text-xs">
                <span className="font-medium text-slate-700">{r.requirementId}</span>
                {r.clauseContent && (
                  <span className="ml-1 text-slate-400 truncate">— {r.clauseContent.substring(0, 80)}</span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Bottom: Assigned Controls */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Assigned Controls</span>
            <span className="text-xs text-slate-400">{assignedControls.length}</span>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {assignedControls.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-slate-400">No controls assigned</p>
          ) : (
            assignedControls.map(c => (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => handleDragStart(e, c.id, "assigned")}
                onClick={() => toggleAssigned(c.id)}
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-slate-50 ${
                  selectedAssigned.has(c.id) ? "bg-red-50 ring-1 ring-red-300" : ""
                }`}
              >
                <input type="checkbox" checked={selectedAssigned.has(c.id)} readOnly className="h-3 w-3 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{c.name}</div>
                </div>
                {c.effectiveness && (
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
                    c.effectiveness === "Effective" ? "bg-green-100 text-green-700" :
                    c.effectiveness === "Partially" ? "bg-amber-100 text-amber-700" :
                    c.effectiveness === "Ineffective" ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>{c.effectiveness}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Transfer buttons between panels */}
      <div className="flex items-center justify-center gap-2 lg:col-span-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={selectedAvailable.size === 0 || loading}
          onClick={assignSelected}
        >
          {loading ? "…" : "→ Assign"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={selectedAssigned.size === 0 || loading}
          onClick={removeSelected}
        >
          {loading ? "…" : "← Remove"}
        </Button>
      </div>
    </div>
  );
}
