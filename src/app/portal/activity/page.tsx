import Link from "next/link";
import { getPortalContext } from "@/lib/portal-server";
import { getPortalActivity } from "@/lib/portal";
import { PortalEmptyState } from "@/components/PortalEmptyState";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, { icon: string; tone: string }> = {
  evidence_request: { icon: "📄", tone: "text-slate-800" },
  comment: { icon: "💬", tone: "text-slate-800" },
  finding: { icon: "⚠️", tone: "text-slate-800" },
  soc: { icon: "🛡️", tone: "text-slate-800" },
};

export default async function PortalActivityPage({ searchParams }: { searchParams: Promise<{ companyId?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await getPortalContext(Promise.resolve({ companyId: sp.companyId }));
  if (!ctx.companyId) return <div className="mx-auto max-w-7xl px-4 py-6"><PortalEmptyState /></div>;

  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const { items, hasMore } = await getPortalActivity(ctx.companyId, { page });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Activity</h1>
      <p className="mb-6 text-sm text-slate-600">Evidence requests, shared comments, findings and SOC changes.</p>

      {items.length === 0 ? (
        <Card title="No activity">
          <p className="text-sm text-slate-400">No activity recorded for this company.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-lg">{KIND_LABEL[item.kind]?.icon ?? "•"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">{item.title}</div>
                {item.detail ? <div className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</div> : null}
                <div className="mt-1 text-xs text-slate-400">{new Date(item.ts).toLocaleString()}</div>
              </div>
              {item.href ? (
                <Link href={item.href} className="text-xs text-blue-700 underline hover:text-blue-900">
                  Open
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-4">
        {page > 1 ? (
          <Link href={`/portal/activity?page=${page - 1}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ← Prev
          </Link>
        ) : null}
        <span className="text-sm text-slate-500">Page {page}</span>
        {hasMore ? (
          <Link href={`/portal/activity?page=${page + 1}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Next →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
