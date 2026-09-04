"use client";

import { useEffect, useState } from "react";

type BannerState = {
  companyId: string;
  show: boolean;
  currentVersion: number;
  acknowledgedVersion: number | null;
  updateAvailable: boolean;
  diff: {
    added: { standards: string[]; processAreas: string[]; requirements: string[]; controls: string[]; mappings: string[]; templates: string[] };
    changed: Array<{ type: string; key: string }>;
    conflicts: Array<{ type: string; key: string; conflictReason: string }>;
    removed: Array<{ type: string; key: string }>;
  } | null;
};

/**
 * SAMS-016 — portal content-baseline banner. A NOTICE of an APPLIED provider-side
 * content change ("baseline updated v1→v2") with a what-changed summary. Shown
 * until the client acknowledges; the acknowledgment is persisted per company so
 * the banner stays dismissed across re-login.
 */
export function ContentBanner() {
  const [state, setState] = useState<BannerState | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    fetch("/api/portal/content/banner", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState(d))
      .catch(() => setState(null));
  }, []);

  if (!state || !state.show) return null;

  const { diff } = state;
  const added = diff ? diff.added.standards.length + diff.added.processAreas.length + diff.added.requirements.length + diff.added.controls.length + diff.added.mappings.length : 0;

  const acknowledge = async () => {
    setAcknowledging(true);
    try {
      await fetch("/api/portal/content/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: state.companyId }),
      });
      setState({ ...state, show: false, acknowledgedVersion: state.currentVersion });
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-blue-900">
          Content baseline updated v{state.currentVersion - 1}→v{state.currentVersion}
        </div>
        <p className="mt-0.5 text-xs text-blue-700">
          Your management-system content was updated on your behalf. What changed:{` `}
          <span className="font-medium">{added} added · {diff?.changed.length ?? 0} changed · {diff?.conflicts.length ?? 0} conflict · {diff?.removed.length ?? 0} removed</span>.
        </p>
      </div>
      <button
        onClick={acknowledge}
        disabled={acknowledging}
        className="shrink-0 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {acknowledging ? "Acknowledging…" : "Acknowledge"}
      </button>
    </div>
  );
}
