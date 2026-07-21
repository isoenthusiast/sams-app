import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedCompanyId } from "@/lib/authz";
import { redirect } from "next/navigation";
import { ProcessAreaCard } from "@/components/ProcessAreaCard";

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
          <ProcessAreaCard
            key={pa.id}
            id={pa.id}
            name={pa.name}
            standard={pa.standardRef?.standard ?? pa.standard ?? undefined}
            requirementsCount={pa._count.requirements}
            controlsCount={pa._count.controls}
          />
        ))}
        {processAreas.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">No process areas found for the selected company.</p>
        )}
      </div>
    </div>
  );
}
