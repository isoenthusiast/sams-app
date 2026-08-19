"use client";

import { useState } from "react";

/**
 * SysAdmin → Export Data
 *
 * Company-scoped CSV exports for the currently selected company.
 * Row semantics (grilled & agreed 2026-08-19): one row per control × requirement
 * mapping (duplicates for many-to-many), unmapped controls included once with
 * blank requirement columns, all business Control columns + requirement
 * id/clause/intent/applicability + both PA/Standard pairs + mapping mandatory.
 */
export function ExportDataView({
  selectedCompanyId,
  companies,
}: {
  selectedCompanyId: string;
  companies: any[];
}) {
  const [exporting, setExporting] = useState(false);
  const company = companies.find((c) => c.id === selectedCompanyId);

  const exportControls = async () => {
    if (!selectedCompanyId) return;
    setExporting(true);
    try {
      const res = await fetch(
        `/api/admin/export/controls?companyId=${encodeURIComponent(selectedCompanyId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Export failed: ${(body as any).error || res.status}`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "controls.csv";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Export Data</h3>
      <p className="text-sm text-slate-500 mb-4">
        Exports are scoped to the selected company:{" "}
        <span className="font-medium text-slate-700">
          {company?.companyID ?? (selectedCompanyId || "—")}
        </span>
      </p>

      <div className="flex flex-col items-start gap-2">
        <button
          onClick={exportControls}
          disabled={!selectedCompanyId || exporting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "⬇ Export Controls (CSV)"}
        </button>
        {!selectedCompanyId && (
          <p className="text-xs text-amber-600">
            Select a company in the top navigation to enable export.
          </p>
        )}
      </div>

      <p className="mt-4 max-w-2xl text-xs text-slate-500">
        Exports every business column of the selected company&apos;s controls, one row per
        control-requirement mapping (many-to-many mappings repeat the control row). Unmapped
        controls appear once with blank requirement columns. Includes requirement
        id/clause/intent/applicability, both the control&apos;s and the requirement&apos;s Process
        Area &amp; Standard, and the mapping mandatory flag.
      </p>
    </div>
  );
}
