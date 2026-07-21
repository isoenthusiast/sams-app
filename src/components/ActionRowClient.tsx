"use client";

import { useState } from "react";
import { ActionModal } from "@/components/ActionModal";

export function ActionRowClient({ action }: { action: any }) {
  const [showModal, setShowModal] = useState(false);
  const f = action.finding;
  const a = f.assessment;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full text-left flex items-center justify-between rounded border border-slate-100 px-3 py-2 hover:bg-slate-50 text-sm transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900 truncate">{action.actionDescription}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {a.name} · {f.severity}
            {action.actionClosureEffective && <span className="ml-2 text-emerald-700 font-medium">✓ Closed</span>}
          </div>
        </div>
        <span className="text-slate-300 ml-2 shrink-0">→</span>
      </button>
      {showModal && (
        <ActionModal
          action={action}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); }}
        />
      )}
    </>
  );
}
