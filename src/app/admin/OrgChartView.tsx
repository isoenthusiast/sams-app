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

/** Indented tree row — clean, scalable, no CSS connector lines needed */
function TreeNode({ node, searchTerm, onUserNameClick }: { node: OrgNode; searchTerm: string; onUserNameClick: (node: OrgNode) => void }) {
  const [collapsed, setCollapsed] = useState(node.depth >= 1);
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

  return (
    <>
      <div
        className={`flex items-center gap-2 py-1.5 pr-3 text-sm transition-colors border-b border-slate-50
          ${matchesSearch ? "bg-yellow-50" : ""}
          ${node.depth === 0 ? "bg-amber-50/60 font-semibold" : ""}`}
        style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
      >
        <span
          className="w-4 text-center text-[10px] text-slate-400 shrink-0 select-none cursor-pointer"
          onClick={() => hasChildren && setCollapsed(!collapsed)}
        >
          {hasChildren ? (effectiveCollapsed ? "▶" : "▼") : ""}
        </span>
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
          <span className="text-[9px] text-slate-400 truncate hidden lg:inline bg-slate-100 rounded px-1.5 py-0.5 max-w-[160px]">
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
      {hasChildren && !effectiveCollapsed && node.children.map(child => (
        <TreeNode key={child.username} node={child} searchTerm={searchTerm} onUserNameClick={onUserNameClick} />
      ))}
    </>
  );
}

export function OrgChartView() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit user modal state
  const [editUser, setEditUser] = useState<{ id: string; username: string; name: string; email: string; role: string; preferredName: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/org-chart")
      .then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then(data => { setTree(data.tree); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleUserNameClick = async (node: OrgNode) => {
    // Fetch full user details for editing
    try {
      const res = await fetch(`/api/admin/table/User/data?username=${encodeURIComponent(node.username)}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      const user = data.data?.[0];
      if (!user) throw new Error("User not found");
      setEditUser({
        id: node.id,
        username: user.username,
        name: user.name,
        email: user.email || "",
        role: user.role,
        preferredName: user.preferredName || "",
      });
      setSaveMsg(null);
    } catch (e: any) {
      setSaveMsg({ type: "error", text: e.message || "Failed to load user" });
    }
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
            {totalUsers} users · 6 levels · Click ▶ to expand
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, position, or department…"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm w-64 focus:border-blue-400 focus:outline-none"
        />
      </div>

      <div className="border border-slate-200 rounded-lg bg-white overflow-auto max-h-[75vh]">
        <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
          <span className="w-4 shrink-0"></span>
          <span className="flex-1">Name</span>
          <span className="hidden sm:inline w-52">Position</span>
          <span className="hidden lg:inline w-44">Department</span>
          <span className="w-14 text-right">Reports</span>
        </div>

        {tree.map(root => (
          <TreeNode key={root.username} node={root} searchTerm={search} onUserNameClick={handleUserNameClick} />
        ))}

        {tree.length === 0 && !loading && (
          <p className="p-8 text-center text-slate-400">No org chart data.</p>
        )}
      </div>

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
