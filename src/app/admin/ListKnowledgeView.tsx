"use client";

import { useState, useMemo } from "react";

type KbEntry = {
  kID: string; knowledgeName: string; knowledgeContent: string;
  remarks: string | null; createdDate: string; addedBy: string;
  processAreaName: string | null;
};

export function ListKnowledgeView({ entries }: { entries: KbEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Build tree: group by process area
  const tree = useMemo(() => {
    const map = new Map<string, KbEntry[]>();
    for (const e of entries) {
      const key = e.processAreaName || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const filtered = search
    ? tree.map(([pa, items]) => [pa, items.filter(e =>
        e.knowledgeName.toLowerCase().includes(search.toLowerCase()) ||
        e.knowledgeContent.toLowerCase().includes(search.toLowerCase())
      )] as const).filter(([, items]) => items.length > 0)
    : tree;

  const selected = selectedId ? entries.find(e => e.kID === selectedId) : null;

  return (
    <div className="flex gap-0 h-[60vh]">
      {/* Tree panel */}
      <div className="w-64 shrink-0 border-r border-slate-200 overflow-y-auto bg-slate-50">
        <div className="p-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search knowledge…"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
        </div>
        {filtered.map(([pa, items]) => (
          <div key={pa}>
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 uppercase bg-slate-100 border-y border-slate-200">
              {pa} ({items.length})
            </div>
            {items.map(e => (
              <button key={e.kID} onClick={() => setSelectedId(e.kID)}
                className={`w-full text-left px-4 py-1.5 text-xs border-b border-slate-100 transition-colors ${
                  selectedId === e.kID ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-white"
                }`}>
                {e.knowledgeName}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && <p className="p-4 text-xs text-slate-400 text-center">No entries found.</p>}
      </div>

      {/* Content panel */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected ? (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{selected.knowledgeName}</h3>
            <p className="text-[11px] text-slate-400 mb-3">
              {selected.processAreaName || "Uncategorized"} · Added by {selected.addedBy} · {selected.createdDate}
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
