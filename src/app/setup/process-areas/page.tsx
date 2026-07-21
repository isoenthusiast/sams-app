import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

export default async function ProcessAreasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const companyId = await getSelectedCompanyId();

  const processAreas = await prisma.processArea.findMany({
    where: companyId ? { companyId } : {},
    include: {
      standardRef: true,
      _count: { select: { controls: true, subProcesses: true, requirements: true } },
    },
    orderBy: [{ standardRef: { sequenceNo: "asc" } }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Process Areas</h1>
        <p className="text-sm text-slate-500">{processAreas.length} process area(s)</p>
      </div>
      <div className="grid gap-3">
        {processAreas.map((pa) => (
          <Link key={pa.id} href={`/setup/processdetails/${pa.id}`}>
            <Card className="hover:border-blue-300 transition-colors" padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{pa.name}</div>
                  <div className="text-xs text-slate-500">
                    {pa.standardRef?.standard ?? pa.standard} · {pa._count.requirements} requirements · {pa._count.controls} controls
                  </div>
                </div>
                <span className="text-slate-300">→</span>
              </div>
            </Card>
          </Link>
        ))}
        {processAreas.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">No process areas found for the selected company.</p>
        )}
      </div>
    </div>
  );
}
