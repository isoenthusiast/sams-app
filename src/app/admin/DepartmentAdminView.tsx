"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

type Dept = { id: string; name: string; companyId: string; parentDepartmentId?: string | null };

export function DepartmentAdminView({ initialDepartments }: { initialDepartments: Dept[] }) {
  const [departments, setDepartments] = useState<Dept[]>(initialDepartments);
  const [form, setForm] = useState({ name: "" });
  const [editing, setEditing] = useState<Dept | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Build tree from flat list
  const tree = useMemo(() => {
    const map = new Map<string, Dept & { children: (Dept & { children: any[] })[] }>();
    const roots: (Dept & { children: any[] })[] = [];

    for (const d of departments) {
      map.set(d.id, { ...d, children: [] });
    }
    for (const d of departments) {
      const node = map.get(d.id)!;
      if (d.parentDepartmentId && map.has(d.parentDepartmentId)) {
        map.get(d.parentDepartmentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [departments]);

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("Department name is required", "error"); return; }
    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/departments/${editing.id}`
        : "/api/admin/departments";
      const method = editing ? "PUT" : "POST";
      const body: any = { name: form.name.trim() };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (editing) {
        setDepartments(prev => prev.map(d => d.id === editing.id ? data.department : d));
      } else {
        setDepartments(prev => [...prev, data.department]);
      }
      showToast(editing ? "Updated" : "Created", "success");
      setEditing(null); setForm({ name: "" });
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (d: Dept) => {
    if (!confirm(`Delete department "${d.name}" and all sub-departments?`)) return;
    try {
      await fetch(`/api/admin/departments/${d.id}`, { method: "DELETE" });
      setDepartments(prev => prev.filter(x => x.id !== d.id));
      showToast("Deleted", "success");
    } catch { showToast("Failed to delete", "error"); }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalCount = departments.length;
  const topLevelCount = tree.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-slate-700">{totalCount} Departments</h3>
          <p className="text-[11px] text-slate-400">{topLevelCount} top-level · expand to see sub-departments</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setEditing(null); setForm({ name: "" }); }}>
          + Add Department
        </Button>
      </div>

      {/* Add/Edit form */}
      {(editing || (!editing && form.name !== "")) && (
        <div className="mb-4 flex gap-2">
          <input type="text" value={form.name} onChange={e => setForm({ name: e.target.value })}
            placeholder="Department name"
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : editing ? "Update" : "Add"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setForm({ name: "" }); }}>Cancel</Button>
        </div>
      )}

      {editing && (
        <div className="mb-3 text-xs text-slate-400">
          Editing: <span className="font-medium text-slate-600">{editing.name}</span>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg bg-white overflow-auto max-h-[55vh]">
        {tree.map(node => (
          <DeptTreeNode
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggleExpand}
            onEdit={d => { setEditing(d); setForm({ name: d.name }); }}
            onDelete={handleDelete}
          />
        ))}
        {departments.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">No departments found.</p>
        )}
      </div>
    </div>
  );
}

type TreeNode = Dept & { children: TreeNode[] };

function DeptTreeNode({ node, depth, expanded, onToggle, onEdit, onDelete }: {
  node: TreeNode; depth: number; expanded: Set<string>;
  onToggle: (id: string) => void; onEdit: (d: Dept) => void; onDelete: (d: Dept) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);

  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 pr-3 text-sm border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <span
          className="w-4 text-center text-[10px] text-slate-400 shrink-0 select-none cursor-pointer"
          onClick={() => hasChildren && onToggle(node.id)}
        >
          {hasChildren ? (isOpen ? "▼" : "▶") : ""}
        </span>
        <button
          onClick={() => onEdit(node)}
          className="text-left text-xs text-slate-700 hover:text-blue-600 hover:underline truncate flex-1"
          title={`Edit ${node.name}`}
        >
          {node.name}
        </button>
        {hasChildren && (
          <span className="text-[10px] text-slate-400 shrink-0">{node.children.length}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node); }}
          className="text-[10px] text-red-400 hover:text-red-600 shrink-0 ml-1"
          title="Delete"
        >
          🗑
        </button>
      </div>
      {hasChildren && isOpen && node.children.map(child => (
        <DeptTreeNode key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}
