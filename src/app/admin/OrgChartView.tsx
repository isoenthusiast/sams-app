"use client";

import { useState, useEffect, useMemo } from "react";

type OrgNode = {
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
function TreeNode({ node, searchTerm }: { node: OrgNode; searchTerm: string }) {
  const [collapsed, setCollapsed] = useState(node.depth >= 1);
  const hasChildren = node.children.length > 0;

  const matchesSearch = searchTerm
    ? node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        className={`flex items-center gap-2 py-1.5 pr-3 text-sm cursor-pointer hover:bg-blue-50/50 transition-colors border-b border-slate-50
          ${matchesSearch ? "bg-yellow-50" : ""}
          ${node.depth === 0 ? "bg-amber-50/60 font-semibold" : ""}`}
        style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
        onClick={() => hasChildren && setCollapsed(!collapsed)}
      >
        <span className="w-4 text-center text-[10px] text-slate-400 shrink-0 select-none">
          {hasChildren ? (effectiveCollapsed ? "▶" : "▼") : ""}
        </span>
        <span className={`truncate ${node.depth === 0 ? "text-slate-900 text-xs" : "text-slate-700 text-xs"}`}>
          {node.name}
          {node.preferredName && <span className="text-slate-400 font-normal ml-1">({node.preferredName})</span>}
        </span>
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
        <TreeNode key={child.username} node={child} searchTerm={searchTerm} />
      ))}
    </>
  );
}

export function OrgChartView() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/org-chart")
      .then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then(data => { setTree(data.tree); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

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
          <TreeNode key={root.username} node={root} searchTerm={search} />
        ))}

        {tree.length === 0 && !loading && (
          <p className="p-8 text-center text-slate-400">No org chart data.</p>
        )}
      </div>
    </div>
  );
}
