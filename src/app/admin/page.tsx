import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "Admin") redirect("/fla");
  const companyId = await getSelectedCompanyId();
  const sp = await searchParams;
  const view = sp.view ?? "dashboard";

  const where = companyId ? { companyId } : {};
  const [tableCount, userCount, controlCount, reqCount, assessmentCount, findingCount, actionCount, kbCount] =
    await Promise.all([
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`),
      prisma.user.count(),
      prisma.control.count({ where }),
      prisma.requirement.count({ where }),
      prisma.assessment.count({ where }),
      prisma.finding.count({ where: { assessment: where } }),
      prisma.action.count({ where: { finding: { assessment: where } } }),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) as count FROM "Knowledgebase"` + (companyId ? ` WHERE "companyId" = '${companyId}'` : "")),
    ]);

  // Activity log (for activity view)
  const activityLog = view === "activity"
    ? await prisma.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 50 })
    : [];

  // Users (for users view)
  const users = view === "users"
    ? await prisma.user.findMany({ orderBy: { name: "asc" }, include: { userCompanies: { include: { company: true } } } })
    : [];

  // Templates (for templates view)
  const templates = view === "templates"
    ? await prisma.assessmentTemplate.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { controlLinkages: true } } } })
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">System overview and management</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Database Tables" value={Number(tableCount[0]?.count ?? 0)} />
        <StatCard label="Users" value={userCount} />
        <StatCard label="Controls" value={controlCount} />
        <StatCard label="Requirements" value={reqCount} />
        <StatCard label="Assessments" value={assessmentCount} />
        <StatCard label="Findings" value={findingCount} />
        <StatCard label="Actions" value={actionCount} />
        <StatCard label="KB Entries" value={Number(kbCount[0]?.count ?? 0)} />
      </div>

      <div className="mt-6 border-b border-slate-200 flex gap-1">
        {[{ k: "dashboard", l: "📊 Dashboard" }, { k: "activity", l: "📜 Activity Log" }, { k: "users", l: "👥 Users" }, { k: "templates", l: "📦 Templates" }].map((t) => (
          <Link key={t.k} href={`/admin?view=${t.k}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === t.k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.l}
          </Link>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {view === "dashboard" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card title="⚡ Quick Actions" padding="sm">
            <div className="flex flex-wrap gap-2">
              <Link href="/setup/process-areas"><Button variant="secondary" size="sm">Process Areas</Button></Link>
              <Link href="/admin/database"><Button variant="secondary" size="sm">Database</Button></Link>
              <Link href="/admin?view=users"><Button variant="secondary" size="sm">Users</Button></Link>
              <Link href="/admin?view=templates"><Button variant="secondary" size="sm">Templates</Button></Link>
              <Link href="/admin?view=activity"><Button variant="secondary" size="sm">Activity Log</Button></Link>
            </div>
          </Card>
          <Card title="📊 System Status" padding="sm">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Connected as</span><span className="font-medium">{session.user.name} (Admin)</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Company</span><span className="font-medium">{companyId ?? "All"}</span></div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Activity Log ── */}
      {view === "activity" && (
        <div className="mt-6 space-y-1">
          <p className="text-sm text-slate-500 mb-4">Last 50 activity log entries</p>
          {activityLog.map((log) => (
            <div key={log.id} className="flex items-start gap-3 border-b border-slate-100 py-2 text-sm">
              <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</span>
              <span className="text-xs font-medium text-slate-600 w-20 flex-shrink-0">{log.activityType}</span>
              <span className="flex-1 text-slate-700">{log.description}</span>
              <span className="text-xs text-slate-400">{log.username}</span>
            </div>
          ))}
          {activityLog.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No activity recorded yet.</p>}
        </div>
      )}

      {/* ── Users ── */}
      {view === "users" && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-500 mb-2">{users.length} user(s)</p>
          {users.map((u) => (
            <Card key={u.id} padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900">{u.name} <span className="text-xs text-slate-400">@{u.username}</span></div>
                  <div className="text-xs text-slate-500">Role: {u.role} · Points: {u.totalPoints}</div>
                </div>
                <div className="text-xs text-slate-400">
                  {u.userCompanies?.map((uc) => uc.company.companyID).join(", ") || "No company"}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Templates ── */}
      {view === "templates" && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-500 mb-2">{templates.length} template(s)</p>
          {templates.map((t) => (
            <Card key={t.id} padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900">{t.name}</div>
                  {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                </div>
                <div className="text-xs text-slate-400">{t._count.controlLinkages} controls</div>
              </div>
            </Card>
          ))}
          {templates.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No templates found.</p>}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card padding="sm">
      <div className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  );
}
