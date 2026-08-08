"use client";

import { useState, useMemo } from "react";
import { CollapsibleSection } from "@/components/CollapsibleSection";

type KbEntry = {
  kID: string; knowledgeName: string; knowledgeContent: string;
  remarks: string | null; createdDate: string; addedBy: string;
  processAreaName: string | null; standardName: string | null;
};

type TreeNode = { std: string; pas: [string, KbEntry[]][] };

export function ListKnowledgeView({ entries }: { entries: KbEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Build tree: Standard → ProcessArea → knowledge entries
  const tree = useMemo(() => {
    const stdMap = new Map<string, Map<string, KbEntry[]>>();
    for (const e of entries) {
      const std = e.standardName || "No Standard";
      const pa = e.processAreaName || "Uncategorized";
      if (!stdMap.has(std)) stdMap.set(std, new Map());
      const paMap = stdMap.get(std)!;
      if (!paMap.has(pa)) paMap.set(pa, []);
      paMap.get(pa)!.push(e);
    }
    const result: TreeNode[] = [];
    for (const [std, paMap] of [...stdMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      result.push({ std, pas: [...paMap.entries()].sort((a, b) => a[0].localeCompare(b[0])) });
    }
    return result;
  }, [entries]);

  const filtered = useMemo<TreeNode[]>(() => {
    if (!search) return tree;
    const t = search.toLowerCase();
    const out: TreeNode[] = [];
    for (const node of tree) {
      const pas: [string, KbEntry[]][] = [];
      for (const [pa, items] of node.pas) {
        const hits = items.filter(e =>
          e.knowledgeName.toLowerCase().includes(t) || e.knowledgeContent.toLowerCase().includes(t));
        if (hits.length) pas.push([pa, hits]);
      }
      if (pas.length) out.push({ std: node.std, pas });
    }
    return out;
  }, [tree, search]);

  const selected = selectedId ? entries.find(e => e.kID === selectedId) : null;
  const totalInStd = (node: TreeNode) => node.pas.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="flex gap-0 h-[60vh]">
      {/* Tree panel */}
      <div className="w-64 shrink-0 border-r border-slate-200 overflow-y-auto bg-slate-50">
        <div className="p-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search knowledge…"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
        </div>
        <div className="p-1.5">
          {filtered.map(node => (
            <CollapsibleSection key={node.std} title={node.std} count={totalInStd(node)} defaultOpen={false}>
              <div className="space-y-1 pl-1 border-l border-slate-200 ml-1">
                {node.pas.map(([pa, items]) => (
                  <CollapsibleSection key={pa} title={pa} count={items.length} defaultOpen={false}>
                    <div className="space-y-0.5 pl-1">
                      {items.map(e => (
                        <button key={e.kID} onClick={() => setSelectedId(e.kID)}
                          className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                            selectedId === e.kID ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-white"
                          }`}>
                          {e.knowledgeName}
                        </button>
                      ))}
                    </div>
                  </CollapsibleSection>
                ))}
              </div>
            </CollapsibleSection>
          ))}
          {filtered.length === 0 && <p className="p-4 text-xs text-slate-400 text-center">No entries found.</p>}
        </div>
      </div>

      {/* Content panel */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected ? (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{selected.knowledgeName}</h3>
            <p className="text-[11px] text-slate-400 mb-3">
              {selected.standardName || "No Standard"} · {selected.processAreaName || "Uncategorized"} · Added by {selected.addedBy} · {selected.createdDate}
            </p>
            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: selected.knowledgeContent }} />
            {selected.remarks && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                <strong>Remarks:</strong> {selected.remarks}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-16">Select a knowledge entry from the left panel.</p>
        )}
      </div>
    </div>
  );
}
