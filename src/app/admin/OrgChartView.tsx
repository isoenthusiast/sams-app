"use client";

import { useState, useEffect, useMemo } from "react";

type OrgNode = {
  id: string;
  username: string;
  name: string;
  preferredName?: string | null;
  email: string | null;
  role: string;
  position: string | null;
  department: string | null;
  orgIndicator: string | null;
  managerUsername: string | null;
  depth: number;
  staffCount: number;
  children: OrgNode[];
};

const LEVEL_COLORS = [
  "bg-amber-50/60",   // L0 — CEO/GM
  "bg-blue-50/50",    // L1
  "bg-emerald-50/50", // L2
  "bg-violet-50/50",  // L3
  "bg-slate-50/50",   // L4+
];

/** Indented tree row with level colors, badges, and drag-to-reorder */
function TreeNode({ node, searchTerm, onUserNameClick, onReorder, siblingCount }: {
  node: OrgNode; searchTerm: string; onUserNameClick: (node: OrgNode) => void;
  onReorder?: (nodeId: string, direction: "up" | "down") => void;
  siblingCount?: number;
}) {
  const [collapsed, setCollapsed] = useState(node.depth >= 1);
  const [dragOver, setDragOver] = useState<"above" | "below" | null>(null);
  const hasChildren = node.children.length > 0;

  const matchesSearch = searchTerm
    ? (node.preferredName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.department || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.position || "").toLowerCase().includes(searchTerm.toLowerCase())
    : true;

  const childMatches = hasChildren && node.children.some(c => {
    if (c.name.toLowerCase().includes(searchTerm.toLowerCase())) return true;
    return c.children.some(gc => gc.name.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  if (searchTerm && !matchesSearch && !childMatches) return null;

  const effectiveCollapsed = searchTerm && childMatches ? false : collapsed;
  const bgColor = LEVEL_COLORS[Math.min(node.depth, LEVEL_COLORS.length - 1)];
  const idx = siblingCount ?? 0;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", node.username);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDragOver(e.clientY < mid ? "above" : "below");
  };

  const handleDragLeave = () => setDragOver(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const draggedUsername = e.dataTransfer.getData("text/plain");
    if (draggedUsername === node.username) return;
    // Determine direction: if drop is "above", dragged item moves above this node (so this node moves down)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const dropAbove = e.clientY < mid;
    // We need to reorder THIS node relative to the dragged one
    onReorder?.(draggedUsername, dropAbove ? "up" : "down");
  };

  const isFirst = idx === 0;
  const isLast = idx === (siblingCount ?? 0) - 1;

  return (
    <>
      {/* Drop indicator above */}
      {dragOver === "above" && (
        <div className="h-0.5 bg-blue-500 mx-2 rounded-full" style={{ marginLeft: `${node.depth * 20 + 8}px` }} />
      )}
      <div
        draggable={!!onReorder}
        onDragStart={onReorder ? handleDragStart : undefined}
        onDragOver={onReorder ? handleDragOver : undefined}
        onDragLeave={onReorder ? handleDragLeave : undefined}
        onDrop={onReorder ? handleDrop : undefined}
        className={`flex items-center gap-2 py-1.5 pr-3 text-sm transition-colors border-b border-slate-100 group
          ${bgColor}
          ${matchesSearch ? "ring-2 ring-yellow-400 ring-inset" : ""}`}
        style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
      >
        {/* Drag handle */}
        {onReorder && (
          <span className="w-3 text-center text-[10px] text-slate-300 cursor-grab active:cursor-grabbing select-none opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="Drag to reorder">⋮⋮</span>
        )}
        <span
          className="w-4 text-center text-[10px] text-slate-400 shrink-0 select-none cursor-pointer"
          onClick={() => hasChildren && setCollapsed(!collapsed)}
        >
          {hasChildren ? (effectiveCollapsed ? "▶" : "▼") : ""}
        </span>
        {/* Level badge */}
        <span className={`shrink-0 text-[9px] font-mono font-bold px-1 rounded ${
          node.depth === 0 ? "bg-amber-200 text-amber-800" :
          node.depth === 1 ? "bg-blue-200 text-blue-800" :
          node.depth === 2 ? "bg-emerald-200 text-emerald-800" :
          "bg-slate-200 text-slate-600"
        }`}>L{node.depth}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onUserNameClick(node); }}
          className={`text-left truncate hover:text-blue-600 hover:underline focus:outline-none ${node.depth === 0 ? "text-slate-900 text-xs font-semibold" : "text-slate-700 text-xs"}`}
          title={`Edit ${node.preferredName || node.name}`}
        >
          {node.preferredName || node.name}
        </button>
        {node.position && (
          <span className="text-[10px] text-slate-400 truncate hidden sm:inline max-w-[180px]">{node.position}</span>
        )}
        {node.department && (
          <span className="text-[9px] text-slate-400 truncate hidden lg:inline bg-white/60 rounded px-1.5 py-0.5 max-w-[160px]">
            {node.department}
          </span>
        )}
        {hasChildren && (
          <span className={`ml-auto shrink-0 rounded-full px-1.5 text-[10px] font-bold leading-tight
            ${effectiveCollapsed ? "bg-slate-200 text-slate-500" : "bg-blue-100 text-blue-700"}`}>
            {node.staffCount}
          </span>
        )}
      </div>
      {/* Drop indicator below last item */}
      {dragOver === "below" && (
        <div className="h-0.5 bg-blue-500 mx-2 rounded-full" style={{ marginLeft: `${node.depth * 20 + 8}px` }} />
      )}
      {hasChildren && !effectiveCollapsed && node.children.map((child, i) => (
        <TreeNode key={child.username} node={child} searchTerm={searchTerm}
          onUserNameClick={onUserNameClick} onReorder={onReorder}
          siblingCount={node.children.length} />
      ))}
    </>
  );
}

/** Visual chart node — card-based with CSS connecting lines */
function ChartTree({ node, searchTerm, depth, onUserNameClick }: { node: OrgNode; searchTerm: string; depth?: number; onUserNameClick: (node: OrgNode) => void }) {
  const d = depth ?? 0;
  const hasChildren = node.children.length > 0;

  const matchesSearch = searchTerm
    ? (node.preferredName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.department || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.position || "").toLowerCase().includes(searchTerm.toLowerCase())
    : true;

  const childHasMatch = hasChildren && node.children.some(c => {
    const cm = (c.preferredName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.username.toLowerCase().includes(searchTerm.toLowerCase());
    return cm || c.children.some(gc =>
      gc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gc.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (searchTerm && !matchesSearch && !childHasMatch) return null;

  const visibleChildren = node.children.filter(c => {
    if (!searchTerm) return true;
    const cm = (c.preferredName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.username.toLowerCase().includes(searchTerm.toLowerCase());
    return cm || c.children.some(gc =>
      gc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gc.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Card color based on depth
  const cardColors = [
    "border-amber-400 bg-amber-50",      // level 0 - CEO/GM
    "border-blue-400 bg-blue-50",         // level 1
    "border-emerald-400 bg-emerald-50",   // level 2
    "border-violet-400 bg-violet-50",     // level 3
    "border-slate-300 bg-slate-50",       // level 4+
  ];
  const cardColor = cardColors[Math.min(d, cardColors.length - 1)];

  return (
    <div className="flex flex-col items-center">
      {/* Node card */}
      <div className={`relative z-10 flex flex-col items-center rounded-lg border-2 px-3 py-2 shadow-sm min-w-[140px] max-w-[200px] ${cardColor} ${matchesSearch ? "ring-2 ring-yellow-400 ring-offset-1" : ""}`}>
        <button
          onClick={() => onUserNameClick(node)}
          className="text-xs font-semibold text-slate-800 hover:text-blue-600 hover:underline text-center leading-tight"
        >
          {node.preferredName || node.name}
        </button>
        {node.position && (
          <span className="text-[10px] text-slate-500 text-center leading-tight mt-0.5">{node.position}</span>
        )}
        {node.department && (
          <span className="text-[9px] text-slate-400 text-center leading-tight mt-0.5 bg-white/60 rounded px-1">{node.department}</span>
        )}
        {hasChildren && (
          <span className="mt-1 text-[10px] font-bold text-slate-400">{node.staffCount} reports</span>
        )}
      </div>

      {/* Children row with connecting lines */}
      {hasChildren && (
        <div className="flex flex-col items-center">
          {/* Vertical line down from card */}
          <div className="w-px h-4 bg-slate-300"></div>
          {/* Horizontal line across */}
          <div className="relative flex items-start">
            <div className="border-t border-slate-300" style={{
              width: `${Math.max(visibleChildren.length * 170, 20)}px`,
              maxWidth: "100%",
            }}></div>
          </div>
          {/* Children */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {visibleChildren.map(child => (
              <ChartTree key={child.username} node={child} searchTerm={searchTerm} depth={d + 1} onUserNameClick={onUserNameClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrgChartView() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"chart" | "list">("chart");

  // Edit user modal state
  const [editUser, setEditUser] = useState<{
    id: string; username: string; name: string; email: string; role: string;
    preferredName: string; department: string; position: string;
    orgIndicator: string; managerName: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/org-chart")
      .then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then(data => { setTree(data.tree); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleUserNameClick = (node: OrgNode) => {
    setEditUser({
      id: node.id,
      username: node.username,
      name: node.name,
      email: node.email || "",
      role: node.role,
      preferredName: node.preferredName || "",
      department: node.department || "",
      position: node.position || "",
      orgIndicator: node.orgIndicator || "",
      managerName: node.managerUsername || "",
    });
    setSaveMsg(null);
  };

  const handleSave = async () => {
    if (!editUser) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editUser.name.trim(),
          email: editUser.email.trim() || undefined,
          preferredName: editUser.preferredName.trim() || undefined,
          role: editUser.role,
          organisationIndicator: editUser.orgIndicator.trim() || undefined,
          managerName: editUser.managerName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      setSaveMsg({ type: "success", text: "Saved! Refreshing…" });
      setTimeout(() => {
        setEditUser(null);
        // Refresh org chart
        fetch("/api/admin/org-chart")
          .then(r => r.json())
          .then(data => setTree(data.tree))
          .catch(() => {});
      }, 800);
    } catch (e: any) {
      setSaveMsg({ type: "error", text: e.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (username: string, direction: "up" | "down") => {
    // Find the node's ID in the tree
    const findNode = (nodes: OrgNode[]): OrgNode | null => {
      for (const n of nodes) {
        if (n.username === username) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(tree);
    if (!node) return;
    try {
      await fetch(`/api/admin/users/${node.id}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      // Refresh
      const data = await fetch("/api/admin/org-chart").then(r => r.json());
      setTree(data.tree);
    } catch { /* no-op */ }
  };

  const totalUsers = useMemo(() => {
    const count = (nodes: OrgNode[]): number =>
      nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
    return count(tree);
  }, [tree]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading org chart…</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">🏢 SMDS Organisation Chart</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {totalUsers} users · 6 levels · Drag rows to reorder · Click name to edit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-300 overflow-hidden">
            <button
              onClick={() => setViewMode("chart")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === "chart" ? "bg-blue-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >📊 Chart</button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-blue-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >📋 List</button>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, position, or department…"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm w-64 focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="border border-slate-200 rounded-lg bg-white overflow-auto max-h-[75vh]">
          <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            <span className="w-3 shrink-0"></span>
            <span className="w-4 shrink-0"></span>
            <span className="w-6 shrink-0"></span>
            <span className="flex-1">Name</span>
            <span className="hidden sm:inline w-52">Position</span>
            <span className="hidden lg:inline w-44">Department</span>
            <span className="w-14 text-right">Reports</span>
          </div>
          {tree.map((root, i) => (
            <TreeNode key={root.username} node={root} searchTerm={search}
              onUserNameClick={handleUserNameClick}
              onReorder={handleReorder}
              siblingCount={tree.length} />
          ))}
          {tree.length === 0 && !loading && (
            <p className="p-8 text-center text-slate-400">No org chart data.</p>
          )}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-auto max-h-[75vh] p-6">
          {tree.map(root => (
            <ChartTree key={root.username} node={root} searchTerm={search} onUserNameClick={handleUserNameClick} />
          ))}
          {tree.length === 0 && (
            <p className="p-8 text-center text-slate-400">No org chart data.</p>
          )}
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Edit: {editUser.preferredName || editUser.name}</h3>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Name</label>
                <input type="text" value={editUser.name}
                  onChange={e => setEditUser({ ...editUser, name: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Preferred Name</label>
                <input type="text" value={editUser.preferredName}
                  onChange={e => setEditUser({ ...editUser, preferredName: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Calling name / nickname" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Email</label>
                <input type="email" value={editUser.email}
                  onChange={e => setEditUser({ ...editUser, email: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Role</label>
                <select value={editUser.role}
                  onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white">
                  <option value="Admin">Admin</option>
                  <option value="Superuser">Superuser</option>
                  <option value="Assessor">Assessor</option>
                  <option value="Interviewee">Interviewee</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-0.5">Department</label>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded border border-slate-200 px-2 py-1.5">{editUser.department || "—"}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-0.5">Position</label>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded border border-slate-200 px-2 py-1.5">{editUser.position || "—"}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Organisation Indicator</label>
                <input type="text" value={editUser.orgIndicator}
                  onChange={e => setEditUser({ ...editUser, orgIndicator: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. UPC/L/HMSA" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Manager Username</label>
                <input type="text" value={editUser.managerName}
                  onChange={e => setEditUser({ ...editUser, managerName: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
                  placeholder="e.g. NLSKH6 or TOP" />
              </div>

              {saveMsg && (
                <p className={`text-xs ${saveMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{saveMsg.text}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} disabled={saving}
                  className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button onClick={() => setEditUser(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
