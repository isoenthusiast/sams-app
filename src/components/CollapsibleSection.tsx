"use client";

import { useState } from "react";

type Props = {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({ title, count, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between mb-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors focus:outline-2 focus:outline-blue-500 rounded"
        aria-expanded={open}
      >
        <span>{title} ({count})</span>
        <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}
