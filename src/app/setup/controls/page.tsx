import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { HealthIndicator } from "@/components/HealthIndicator";
import { Badge } from "@/components/Badge";

export const dynamic = "force-dynamic";

export default async function ControlsPage({ searchParams }: { searchParams: Promise<{ search?: string; pa?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const companyId = await getSelectedCompanyId();
  const sp = await searchParams;
  const search = sp.search ?? "";
  const paFilter = sp.pa ?? "";

  const where: any = companyId ? { companyId } : {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { statement: { contains: search, mode: "insensitive" } },
    ];
  }
  if (paFilter) where.processAreaId = paFilter;

  const [controls, processAreas] = await Promise.all([
    prisma.control.findMany({
      where,
      include: {
        processArea: { select: { id: true, name: true } },
        _count: { select: { controlAssignments: true } },
        controlAssignments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
      take: 100,
    }),
    prisma.processArea.findMany({
      where: companyId ? { companyId } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Controls</h1>
      <div className="mb-4 flex flex-wrap gap-3">
        <form className="flex gap-2 flex-1 min-w-[200px]">
          <input type="text" name="search" defaultValue={search} placeholder="Search controls..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select name="pa" defaultValue={paFilter} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All Process Areas</option>
            {processAreas.map((pa) => (
              <option key={pa.id} value={pa.id}>{pa.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-blue-800 px-4 py-2 text-sm text-white hover:bg-blue-900">Search</button>
        </form>
      </div>

      <p className="text-sm text-slate-500 mb-4">{controls.length} control(s) shown</p>

      <div className="space-y-3">
        {controls.map((c) => {
          const lastCa = c.controlAssignments[0];
          const effective = c._count.controlAssignments > 0
            ? Math.round((c.controlAssignments.filter((ca) => ca.effective === "Effective").length / c._count.controlAssignments) * 100)
            : c.rawHealthScore;
          return (
            <Card key={c.id} padding="sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <p className="text-sm text-slate-600 mt-0.5 whitespace-normal break-words">{c.statement}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="default">{c.controlType}</Badge>
                    {c.isHsseCritical && <Badge variant="danger">HSSE Critical</Badge>}
                    {c.processArea && (
                      <Link href={`/setup/processdetails/${c.processArea.id}`} className="text-xs text-blue-600 hover:underline">
                        {c.processArea.name}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <HealthIndicator score={effective} size="sm" />
                  <div className="text-xs text-slate-400 mt-1">{c._count.controlAssignments} assignments</div>
                  {lastCa?.createdAt && (
                    <div className="text-xs text-slate-400">Last: {new Date(lastCa.createdAt).toLocaleDateString()}</div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {controls.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">No controls found.</p>
        )}
      </div>
    </div>
  );
}
