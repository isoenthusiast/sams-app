"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { formatDate } from "@/lib/formatDate";

type KbEntry = { kID: string; knowledgeName: string; knowledgeContent: string; remarks?: string | null; createdDate: string; addedBy?: string };
type KnowledgebasePanelProps = { entries: KbEntry[] };

const PAGE_SIZE = 10;

export function KnowledgebasePanel({ entries }: KnowledgebasePanelProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const paged = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (entries.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-400">No knowledgebase entries for this process area.</p>;
  }
  return (
    <div className="space-y-4">
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{entries.length} entries</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-30"
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className="px-2 py-1">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-30"
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </div>
      )}
      {paged.map((entry) => (
        <Card key={entry.kID} padding="sm">
          <h3 className="font-semibold text-slate-900">{entry.knowledgeName}</h3>
          <div className="text-xs text-slate-500 mt-1">
            Added by {entry.addedBy ?? "—"} · {formatDate(entry.createdDate)}
          </div>
          <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap line-clamp-6">{entry.knowledgeContent}</p>
        </Card>
      ))}
    </div>
  );
}
