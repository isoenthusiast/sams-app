import { getPortalContext } from "@/lib/portal-server";
import { getPortalFindings } from "@/lib/portal";
import { PortalEmptyState } from "@/components/PortalEmptyState";
import { Card } from "@/components/Card";
import { ManagementResponseEditor } from "@/components/ManagementResponseEditor";

export const dynamic = "force-dynamic";

const SEVERITY_TONES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-red-100 text-red-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-green-100 text-green-800",
  Major: "bg-red-100 text-red-800",
  Minor: "bg-amber-100 text-amber-800",
};

export default async function PortalFindingsPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const ctx = await getPortalContext(searchParams);
  if (!ctx.companyId) return <div className="mx-auto max-w-7xl px-4 py-6"><PortalEmptyState /></div>;

  const findings = await getPortalFindings(ctx.companyId);
  const canRespond = ["Admin", "Superuser", "Assessor"].includes(ctx.userRole);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Findings</h1>
      <p className="mb-6 text-sm text-slate-600">Requirement and control gaps identified during assessment.</p>

      {findings.length === 0 ? (
        <Card title="No findings">
          <p className="text-sm text-slate-400">No findings recorded for this company.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {findings.map((f) => (
            <details key={f.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_TONES[f.severity] ?? "bg-slate-100 text-slate-600"}`}>{f.severity}</span>
                      <span className="truncate text-sm font-medium text-slate-900">{f.description}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      <span>{f.assessment?.name}</span>
                      {f.requirementRId != null ? <span> · Requirement #{f.requirementRId}</span> : null}
                      {f.actions?.length ? <span> · {f.actions.length} action(s)</span> : null}
                    </div>
                  </div>
                  {f.managementResponse ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Response ✓</span>
                  ) : null}
                </div>
              </summary>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                {f.riskDescription ? <p><span className="font-medium">Risk:</span> {f.riskDescription}</p> : null}
                {f.rootCause ? <p><span className="font-medium">Root cause:</span> {f.rootCause}</p> : null}
                {f.recommendation ? <p><span className="font-medium">Recommendation:</span> {f.recommendation}</p> : null}
              </div>

              {f.managementResponse ? (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="text-xs font-semibold text-blue-800">Management response</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{f.managementResponse}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {f.managementResponseBy?.name ?? "Unknown"} ·{" "}
                    {f.managementResponseAt ? new Date(f.managementResponseAt).toLocaleString() : "saved"}
                  </div>
                </div>
              ) : null}

              {canRespond ? (
                <ManagementResponseEditor
                  findingId={f.id}
                  initialResponse={f.managementResponse}
                  initialBy={f.managementResponseBy ? { name: f.managementResponseBy.name, username: f.managementResponseBy.username } : null}
                />
              ) : null}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
