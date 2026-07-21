import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "Admin") redirect("/fla");
  const companyId = await getSelectedCompanyId();

  const where = companyId ? { companyId } : {};
  const [
    tableCount, userCount, controlCount, reqCount,
    assessmentCount, findingCount, actionCount, kbCount,
  ] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`),
    prisma.user.count(),
    prisma.control.count({ where }),
    prisma.requirement.count({ where }),
    prisma.assessment.count({ where }),
    prisma.finding.count({ where: { assessment: where } }),
    prisma.action.count({ where: { finding: { assessment: where } } }),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) as count FROM "Knowledgebase"` + (companyId ? ` WHERE "companyId" = '${companyId}'` : "")),
  ]);

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

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card title="⚡ Quick Actions" padding="sm">
          <div className="flex flex-wrap gap-2">
            <Link href="/setup/process-areas"><Button variant="secondary" size="sm">Process Areas</Button></Link>
            <Link href="/admin/database"><Button variant="secondary" size="sm">Database</Button></Link>
            <Link href="/admin"><Button variant="secondary" size="sm">Users</Button></Link>
            <Link href="/admin"><Button variant="secondary" size="sm">Requirements</Button></Link>
            <Link href="/admin"><Button variant="secondary" size="sm">Templates</Button></Link>
            <Link href="/admin"><Button variant="secondary" size="sm">Activity Log</Button></Link>
          </div>
        </Card>
        <Card title="📊 System Status" padding="sm">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Connected as</span><span className="font-medium">{session.user.name} (Admin)</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Company</span><span className="font-medium">{companyId ?? "All"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Session maxAge</span><span className="font-medium">8 hours</span></div>
          </div>
        </Card>
      </div>
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
