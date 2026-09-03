import { getPortalContext } from "@/lib/portal-server";
import { getPortalActions } from "@/lib/portal";
import { PortalEmptyState } from "@/components/PortalEmptyState";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

export default async function PortalActionsPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const ctx = await getPortalContext(searchParams);
  if (!ctx.companyId) return <div className="mx-auto max-w-7xl px-4 py-6"><PortalEmptyState /></div>;

  const actions = await getPortalActions(ctx.companyId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Actions</h1>
      <p className="mb-6 text-sm text-slate-600">Remediation actions, with overdue items highlighted.</p>

      {actions.length === 0 ? (
        <Card title="No actions">
          <p className="text-sm text-slate-400">No actions recorded for this company.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => (
            <div key={a.id} className={`rounded-xl border p-5 ${a.overdue ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{a.actionDescription || a.actionDetails || "Action"}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {a.finding ? <span>Finding: {a.finding.description}</span> : null}
                    {a.auditee ? <span> · Owner: {a.auditee}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {a.overdue ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">Overdue</span>
                  ) : null}
                  {a.targetDate ? (
                    <span className={a.overdue ? "font-semibold text-red-700" : "text-slate-500"}>
                      Target: {new Date(a.targetDate).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
                {a.closureDate ? (
                  <span className="text-green-700">Closed {new Date(a.closureDate).toLocaleDateString()}</span>
                ) : (
                  <span className="text-amber-700">Open</span>
                )}
                {a.closureEvidence ? (
                  <a href={a.closureEvidence} className="text-blue-700 underline" target="_blank" rel="noreferrer">
                    Closure evidence
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
