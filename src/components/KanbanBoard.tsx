"use client";

import { useState, useCallback, useRef } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { cn } from "@/lib/cn";

// ── Types ────────────────────────────────────────────────────────────
type BacklogItem = {
  id: string;
  title: string;
  description: string | null;
  type: "Feature" | "Request" | "Bug" | "Task";
  status: "Backlog" | "SprintBacklog" | "InProgress" | "Completed";
  stage: "PlanDesign" | "Implement" | "Testing" | null;
  priority: number;
  justification: string | null;
  approach: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

// ── Column definitions ───────────────────────────────────────────────
const COLUMNS = [
  { key: "Backlog", label: "📥 Backlog", color: "border-slate-300 bg-slate-50" },
  { key: "SprintBacklog", label: "🏃 Sprint Backlog", color: "border-blue-300 bg-blue-50" },
  { key: "InProgress", label: "🚧 In Progress", color: "border-amber-300 bg-amber-50" },
  { key: "Completed", label: "✅ Completed", color: "border-emerald-300 bg-emerald-50" },
] as const;

const STAGES: { key: "PlanDesign" | "Implement" | "Testing"; label: string; emoji: string }[] = [
  { key: "PlanDesign", label: "Plan & Design", emoji: "📐" },
  { key: "Implement", label: "Implement", emoji: "🔨" },
  { key: "Testing", label: "Testing", emoji: "🧪" },
];

const TYPE_CONFIG: Record<string, { label: string; variant: "info" | "warning" | "danger" | "default" }> = {
  Feature: { label: "Feature", variant: "info" },
  Request: { label: "Request", variant: "warning" },
  Bug: { label: "Bug", variant: "danger" },
  Task: { label: "Task", variant: "default" },
};

const MAX_VISIBLE = 5;

// ── Props ─────────────────────────────────────────────────────────────
type KanbanBoardProps = {
  initialItems: BacklogItem[];
};

// ── Component ─────────────────────────────────────────────────────────
export function KanbanBoard({ initialItems }: KanbanBoardProps) {
  const [items, setItems] = useState<BacklogItem[]>(initialItems);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const dragOverRef = useRef<string | null>(null);

  const toggleExpand = (colKey: string) => {
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey); else next.add(colKey);
      return next;
    });
  };

  // ── Archived filter (Completed > 30 days hidden by default) ────
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const isArchived = (item: BacklogItem) =>
    item.status === "Completed" && (Date.now() - new Date(item.updatedAt).getTime()) > THIRTY_DAYS;

  // ── API helpers ──────────────────────────────────────────────────
  const updateItem = useCallback(async (id: string, data: Partial<BacklogItem>) => {
    const res = await fetch("/api/admin/backlog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    if (res.ok) {
      const { item } = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
    }
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    await fetch(`/api/admin/backlog?id=${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const createItem = useCallback(async (data: Partial<BacklogItem>) => {
    const res = await fetch("/api/admin/backlog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { item } = await res.json();
      setItems((prev) => [...prev, item]);
    }
  }, []);

  // ── Drag & drop ──────────────────────────────────────────────────
  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragEnd = () => { setDraggedId(null); dragOverRef.current = null; };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    dragOverRef.current = columnKey;
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    if (!draggedId) return;
    const item = items.find((i) => i.id === draggedId);
    if (!item || item.status === targetStatus) return;

    // Moving to InProgress auto-sets stage to PlanDesign if not already set
    const update: any = { status: targetStatus };
    if (targetStatus !== "InProgress") update.stage = null;
    else if (!item.stage) update.stage = "PlanDesign";

    updateItem(draggedId, update);
    setDraggedId(null);
    dragOverRef.current = null;
  };

  // ── Stage change (InProgress only) ──────────────────────────────
  const cycleStage = (item: BacklogItem) => {
    if (item.status !== "InProgress") return;
    const stages: Array<BacklogItem["stage"]> = ["PlanDesign", "Implement", "Testing"];
    const currentIdx = stages.indexOf(item.stage);
    const next = stages[(currentIdx + 1) % stages.length];
    updateItem(item.id, { stage: next });
  };

  // ── Filter items by column ──────────────────────────────────────
  const getItems = (status: string) => {
    let filtered = items.filter((i) => i.status === status);
    // Hide archived completed items unless showArchived is on
    if (status === "Completed" && !showArchived) {
      filtered = filtered.filter((i) => !isArchived(i));
    }
    return filtered.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
  };
  const archivedCount = items.filter((i) => i.status === "Completed" && isArchived(i)).length;

  // ── Render helpers ──────────────────────────────────────────────
  const StageBadge = ({ stage }: { stage: BacklogItem["stage"] }) => {
    if (!stage) return null;
    const s = STAGES.find((x) => x.key === stage);
    return (
      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
        {s?.emoji} {s?.label}
      </span>
    );
  };

  // ── Render cards helper (shared by all columns) ─────────────────
  const renderCards = (col: typeof COLUMNS[number], colItems: BacklogItem[]) => (
    <>
      {colItems.slice(0, expandedColumns.has(col.key) ? undefined : MAX_VISIBLE).map((item) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(item.id)}
          onDragEnd={handleDragEnd}
          onClick={() => setEditingItem(item)}
          className={cn(
            "rounded-md border bg-white p-3 shadow-sm cursor-pointer transition-all",
            "hover:shadow-md hover:-translate-y-0.5",
            draggedId === item.id && "opacity-50 rotate-1"
          )}
        >
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <Badge variant={TYPE_CONFIG[item.type]?.variant ?? "default"} size="sm">
              {TYPE_CONFIG[item.type]?.label ?? item.type}
            </Badge>
            {item.priority > 0 && (
              <span className="text-xs text-slate-400">P{item.priority}</span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-800 leading-snug">{item.title}</p>
          {item.status === "InProgress" && (
            <button
              onClick={(e) => { e.stopPropagation(); cycleStage(item); }}
              className="mt-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              title="Click to advance stage"
            >
              <StageBadge stage={item.stage} />
            </button>
          )}
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{item.createdBy}</span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
      {colItems.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-6">Drop items here</p>
      )}
      {colItems.length > MAX_VISIBLE && (
        <button
          onClick={() => toggleExpand(col.key)}
          className="w-full mt-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-white/50 rounded-md transition-colors"
        >
          {expandedColumns.has(col.key)
            ? "▲ Show less"
            : `+ ${colItems.length - MAX_VISIBLE} more`}
        </button>
      )}
    </>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">📋 Project Backlog</h2>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={cn(
                "text-xs px-2 py-1 rounded-md border transition-colors",
                showArchived
                  ? "bg-slate-100 border-slate-300 text-slate-700"
                  : "border-slate-200 text-slate-400 hover:text-slate-600"
              )}
            >
              {showArchived ? "📦 Hide archived" : `📦 ${archivedCount} archived`}
            </button>
          )}
          <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
            + New Item
          </Button>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const colItems = getItems(col.key);
          const isDragOver = dragOverRef.current === col.key;

          return (
            <div
              key={col.key}
              className={cn(
                "rounded-lg border-2 p-3 min-h-[200px] transition-colors",
                col.color,
                isDragOver && "ring-2 ring-blue-400 border-blue-400"
              )}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                <Badge variant="default" size="sm">{colItems.length}</Badge>
              </div>

              {col.key !== "Completed" && (
                <div className="space-y-2">
                  {renderCards(col, colItems)}
                </div>
              )}

              {/* Completed column — collapsible */}
              {col.key === "Completed" && !completedExpanded && (
                <button
                  onClick={() => setCompletedExpanded(true)}
                  className="w-full py-8 text-xs text-slate-400 hover:text-slate-600 hover:bg-white/40 rounded-md transition-colors flex flex-col items-center gap-1"
                >
                  <span className="text-lg">📋</span>
                  <span>{colItems.length} completed item{colItems.length !== 1 ? "s" : ""}</span>
                  <span className="text-slate-300">Click to show</span>
                </button>
              )}
              {col.key === "Completed" && completedExpanded && (
                <div className="space-y-2">
                  <button
                    onClick={() => setCompletedExpanded(false)}
                    className="w-full py-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    ▲ Collapse
                  </button>
                  {renderCards(col, colItems)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add Modal ─────────────────────────────────────────────── */}
      {showAddModal && (
        <AddEditModal
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            await createItem(data);
            setShowAddModal(false);
          }}
        />
      )}

      {/* ── Edit/Detail Modal ──────────────────────────────────────── */}
      {editingItem && (
        <AddEditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={async (data) => {
            await updateItem(editingItem.id, data);
            setEditingItem(null);
          }}
          onDelete={async () => {
            if (confirm(`Delete "${editingItem.title}"?`)) {
              await deleteItem(editingItem.id);
              setEditingItem(null);
            }
          }}
          onMoveToSprint={() => {
            updateItem(editingItem.id, { status: "SprintBacklog" });
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

// ── Add/Edit Modal ────────────────────────────────────────────────────
function AddEditModal({
  item,
  onClose,
  onSave,
  onDelete,
  onMoveToSprint,
}: {
  item?: BacklogItem;
  onClose: () => void;
  onSave: (data: Partial<BacklogItem>) => Promise<void>;
  onDelete?: () => void;
  onMoveToSprint?: () => void;
}) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [type, setType] = useState(item?.type ?? "Task");
  const [priority, setPriority] = useState(item?.priority ?? 0);
  const [justification, setJustification] = useState(item?.justification ?? "");
  const [approach, setApproach] = useState(item?.approach ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      type: type as BacklogItem["type"],
      priority,
      justification: justification.trim() || null,
      approach: approach.trim() || null,
    });
    setSaving(false);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEdit ? "Edit Backlog Item" : "New Backlog Item"}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex gap-2">
            {isEdit && onDelete && (
              <Button variant="danger" size="sm" onClick={onDelete}>
                🗑 Delete
              </Button>
            )}
            {isEdit && item?.status === "Backlog" && onMoveToSprint && (
              <Button variant="warning" size="sm" onClick={onMoveToSprint}>
                🏃 Move to Sprint
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="What needs to be done?"
            autoFocus
          />
        </div>

        {/* Type + Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BacklogItem["type"])}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="Feature">🚀 Feature</option>
              <option value="Request">📩 Request</option>
              <option value="Bug">🐛 Bug</option>
              <option value="Task">📋 Task</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Priority (0 = none)</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              min={0}
              max={100}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            rows={3}
            placeholder="Detailed description of the item..."
          />
        </div>

        {/* Justification (why) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">💡 Justification — Why should this be done?</label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            rows={2}
            placeholder="Business value, user impact, strategic alignment..."
          />
        </div>

        {/* Approach (how) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">🔧 Approach — How should it be done?</label>
          <textarea
            value={approach}
            onChange={(e) => setApproach(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            rows={2}
            placeholder="Technical approach, dependencies, effort estimate..."
          />
        </div>

        {/* Read-only meta for edit mode */}
        {isEdit && item && (
          <div className="text-xs text-slate-400 space-y-1 border-t border-slate-200 pt-3">
            <div className="flex justify-between">
              <span>Status: <strong>{item.status}</strong>{item.stage ? ` · ${item.stage}` : ""}</span>
              <span>Created by: <strong>{item.createdBy}</strong></span>
            </div>
            <div className="flex justify-between">
              <span>Created: {new Date(item.createdAt).toLocaleString()}</span>
              <span>Updated: {new Date(item.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
