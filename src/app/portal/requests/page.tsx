import Link from "next/link";
import { getPortalContext } from "@/lib/portal-server";
import { getPortalRequests } from "@/lib/portal";
import { PortalEmptyState } from "@/components/PortalEmptyState";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, string> = {
  Requested: "bg-amber-100 text-amber-800",
  Submitted: "bg-blue-100 text-blue-800",
  Accepted: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
  Draft: "bg-slate-100 text-slate-600",
  NotApplicable: "bg-slate-100 text-slate-600",
};

export default async function PortalRequestsPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const ctx = await getPortalContext(searchParams);
  if (!ctx.companyId) return <div className="mx-auto max-w-7xl px-4 py-6"><PortalEmptyState /></div>;

  const requests = await getPortalRequests(ctx.userId, ctx.companyId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">My evidence requests</h1>
      <p className="mb-6 text-sm text-slate-600">Requests for evidence addressed to you. Use the link to submit through the app.</p>

      {requests.length === 0 ? (
        <Card title="No evidence requests">
          <p className="text-sm text-slate-400">No evidence requests are addressed to you.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{r.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{r.instructions}</div>
                  {r.assessment ? <div className="mt-1 text-xs text-slate-400">Assessment: {r.assessment.name}</div> : null}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONES[r.status] ?? "bg-slate-100 text-slate-600"}`}>{r.status}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                {r.dueDate ? <span>Due: {new Date(r.dueDate).toLocaleDateString()}</span> : null}
                {r.submittedAt ? <span className="text-green-700">Submitted {new Date(r.submittedAt).toLocaleString()}</span> : null}
                {r.reviewNote ? <span className="text-red-700">Review note: {r.reviewNote}</span> : null}
                <Link href="/fla/my-evidence-requests" className="text-blue-700 underline hover:text-blue-900">
                  Open submit flow
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
