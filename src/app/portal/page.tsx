import Link from "next/link";
import { getPortalContext } from "@/lib/portal-server";
import { getPortalDashboard } from "@/lib/portal";
import { PortalEmptyState } from "@/components/PortalEmptyState";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

function socColor(pct: number | null): string {
  if (pct === null) return "bg-slate-100 text-slate-500";
  if (pct >= 80) return "bg-green-100 text-green-800";
  if (pct >= 50) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

export default async function PortalDashboardPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const ctx = await getPortalContext(searchParams);
  if (!ctx.companyId) return <div className="mx-auto max-w-7xl px-4 py-6"><PortalEmptyState /></div>;

  const dashboard = await getPortalDashboard(ctx.companyId, ctx.userId);
  const { soc } = dashboard;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Assurance overview</h1>
      <p className="mb-6 text-sm text-slate-600">Statements of Compliance and items awaiting your response.</p>

      {/* SOC summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Full compliance" value={soc.fullyComply} sub={`of ${soc.total} requirements assessed`} tone="green" />
        <MetricCard label="Partial compliance" value={soc.partiallyComply} sub="Partially comply" tone="amber" />
        <MetricCard label="Not compliant" value={soc.notComply} sub="Not comply" tone="red" />
        <MetricCard label="Overall coverage" value={soc.coveragePct === null ? "—" : `${soc.coveragePct}%`} sub={soc.coveragePct === null ? "No assessed requirements" : "% Fully Comply of assessed"} tone="blue" />
      </div>

      {/* Open-work cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link href="/portal/findings" className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:shadow-sm">
          <div className="text-3xl font-bold text-slate-900">{dashboard.openFindings}</div>
          <div className="mt-1 text-sm font-medium text-slate-700">Open findings</div>
          <div className="mt-1 text-xs text-slate-400">Review and respond</div>
        </Link>
        <Link href="/portal/actions" className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:shadow-sm">
          <div className={`text-3xl font-bold ${dashboard.overdueActions > 0 ? "text-red-600" : "text-slate-900"}`}>{dashboard.openActions}</div>
          <div className="mt-1 text-sm font-medium text-slate-700">Open actions</div>
          <div className="mt-1 text-xs text-slate-400">{dashboard.overdueActions > 0 ? `${dashboard.overdueActions} overdue` : "None overdue"}</div>
        </Link>
        <Link href="/portal/requests" className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:shadow-sm">
          <div className="text-3xl font-bold text-slate-900">{dashboard.myOpenEvidenceRequests}</div>
          <div className="mt-1 text-sm font-medium text-slate-700">My open evidence requests</div>
          <div className="mt-1 text-xs text-slate-400">Submit requested evidence</div>
        </Link>
      </div>

      {/* SOC by process area */}
      <Card title="Statement of Compliance by process area" className="mt-6">
        {dashboard.perProcessArea.length === 0 ? (
          <p className="text-sm text-slate-400">No process areas found for this company.</p>
        ) : (
          <div className="mt-3 space-y-1">
            {dashboard.perProcessArea.map((pa) => (
              <div key={pa.processAreaId} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{pa.name}</div>
                  <div className="text-xs text-slate-500">{pa.standard}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">{pa.fully}/{pa.assessed} fully comply</span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${socColor(pa.pct)}`}>{pa.pct === null ? "—" : `${pa.pct}%`}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone: "green" | "amber" | "red" | "blue" }) {
  const tones: Record<string, string> = {
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-700",
    blue: "text-blue-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <div className={`text-3xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{label}</div>
      <div className="mt-1 text-xs text-slate-400">{sub}</div>
    </div>
  );
}
