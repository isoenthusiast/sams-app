"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PortfolioCompany = {
  companyId: string;
  companyCode: string;
  companyName: string;
  soc: {
    fullyComply: number;
    partiallyComply: number;
    notComply: number;
    notAssessed: number;
    total: number;
    coveragePct: number | null;
  };
  openFindings: number;
  openActions: number;
  overdueActions: number;
  inProgressAssessments: number;
  userCount: number;
  kbCount: number;
  lastActivity: string | null;
};

const SOC_SEGMENTS = [
  { key: "fullyComply", label: "Fully Comply", color: "bg-green-500" },
  { key: "partiallyComply", label: "Partially Comply", color: "bg-amber-500" },
  { key: "notComply", label: "Not Comply", color: "bg-red-500" },
  { key: "notAssessed", label: "Not Assessed", color: "bg-slate-300" },
] as const;

export function OperatorConsole() {
  const router = useRouter();
  const [companies, setCompanies] = useState<PortfolioCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setCompanies(null);
    try {
      const res = await fetch("/api/operator/portfolio", { cache: "no-store" });
      if (!res.ok) {
        setError(`Failed to load portfolio (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { companies: PortfolioCompany[] };
      setCompanies(data.companies ?? []);
    } catch {
      setError("Could not reach the server. It may be waking up or the session expired.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const switchCompany = async (company: PortfolioCompany) => {
    setSwitchingId(company.companyId);
    try {
      const res = await fetch("/api/operator/context-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.companyId }),
      });
      const data = (await res.json()) as { redirectTo?: string };
      const target = data.redirectTo ?? "/fla";
      router.push(`${target}?companyId=${encodeURIComponent(company.companyId)}`);
    } catch {
      setSwitchingId(null);
      setError("Could not switch context. Try again.");
    }
  };

  if (error) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-center">
        <div className="text-4xl mb-4">🔌</div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Could not load the operator console</h2>
        <p className="text-sm text-slate-500 mb-6">{error}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={load}
            className="rounded-md bg-blue-800 px-5 py-2 text-sm font-medium text-white hover:bg-blue-900"
          >
            Try Again
          </button>
          <button
            onClick={() => {
              if (document.cookie) {
                document.cookie.split(";").forEach((c) => {
                  document.cookie = c
                    .replace(/^ +/, "")
                    .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                });
              }
              window.location.reload();
            }}
            className="rounded-md border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear Cookies &amp; Retry
          </button>
        </div>
      </div>
    );
  }

  if (companies === null) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-md border border-slate-200 bg-white p-4">
            <div className="h-4 w-1/3 rounded bg-slate-200 mb-3" />
            <div className="h-3 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-8 text-center">
        <div className="text-4xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">No companies onboarded yet</h2>
        <p className="text-sm text-slate-500">Once a client company is created it will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Company</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">SOC Coverage</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Findings</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Open Actions</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">In Progress</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Users</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">KB</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Last Activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {companies.map((c) => (
            <tr
              key={c.companyId}
              onClick={() => switchCompany(c)}
              className="cursor-pointer transition-colors hover:bg-blue-50/50"
              title="Click to switch context into this company"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{c.companyCode}</div>
                <div className="text-xs text-slate-500">{c.companyName}</div>
              </td>
              <td className="px-4 py-3 min-w-[220px]">
                <SocBar soc={c.soc} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.openFindings}</td>
              <td className="px-4 py-3 text-right">
                <span className="tabular-nums text-slate-700">{c.openActions}</span>
                {c.overdueActions > 0 && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {c.overdueActions} overdue
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.inProgressAssessments}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.userCount}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.kbCount}</td>
              <td className="px-4 py-3 text-slate-500">{c.lastActivity ? formatDate(c.lastActivity) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SocBar({ soc }: { soc: PortfolioCompany["soc"] }) {
  const total = soc.total;
  const widths = SOC_SEGMENTS.map((seg) => {
    const v = soc[seg.key];
    const w = total === 0 ? (seg.key === "notAssessed" ? 100 : 0) : (v / total) * 100;
    return { ...seg, value: v, width: w };
  });

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-xs font-semibold text-slate-500">Coverage</span>
        <span className="text-xs text-slate-400">
          {soc.coveragePct === null ? "Not assessed" : `${soc.coveragePct}%`} · {total} requirements
        </span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {widths.map(
          (seg) =>
            seg.width > 0 && (
              <div
                key={seg.key}
                className={`${seg.color} h-full`}
                style={{ width: `${seg.width}%` }}
                title={`${seg.label}: ${seg.value}`}
              />
            )
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {widths.map((seg) => (
          <span key={seg.key} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${seg.color}`} />
            {seg.label}: {seg.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
