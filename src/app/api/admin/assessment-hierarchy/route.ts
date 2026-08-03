import { requireAdmin, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — hierarchical Standard→PA→Requirement→Control tree for assessment creation
// NOTE: Groups by Requirement.standard (not Standard.standard) because ISO requirements
// reference ProcessAreas that belong to Shell-specific standards, not ISO standards.
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const companyId = await getSelectedCompanyId();
  const where = companyId ? { companyId } : {};

  // Fetch requirements with their PA, standard, and control mappings
  const requirements = await prisma.requirement.findMany({
    where,
    include: {
      processArea: { select: { id: true, name: true } },
      controlMappings: {
        include: {
          control: { select: { id: true, name: true, controlType: true } },
        },
      },
    },
    orderBy: { requirementId: "asc" },
  });

  // Also get all controls with their PA for unmapped controls
  const allControls = await prisma.control.findMany({
    where,
    select: { id: true, name: true, controlType: true, processAreaId: true, processArea: { select: { name: true } } },
  });

  // Build hierarchy: Standard → PA → Requirement → Controls
  // Group by requirement.standard (the ISO clause standard name)
  const stdMap = new Map<string, Map<string, { reqs: any[]; paId: string }>>();
  
  for (const r of requirements) {
    const stdName = r.standard || "Unknown";
    const paName = r.processArea?.name || "Unknown";
    const paId = r.processArea?.id || "";

    if (!stdMap.has(stdName)) stdMap.set(stdName, new Map());
    const paMap = stdMap.get(stdName)!;
    if (!paMap.has(paName)) paMap.set(paName, { reqs: [], paId });
    
    const mappedControls = r.controlMappings
      .filter((m) => m.control)
      .map((m) => ({
        id: m.control!.id,
        name: m.control!.name,
        controlType: m.control!.controlType,
        mappingId: m.id,
      }));

    paMap.get(paName)!.reqs.push({
      rId: r.rId,
      requirementId: r.requirementId,
      clauseContent: r.clauseContent?.substring(0, 200) || "",
      controls: mappedControls,
      controlCount: mappedControls.length,
    });
  }

  // Also add ProcessAreas that have controls but no requirements mapped yet
  const paWithControls = new Map<string, { id: string; name: string; ctrlCount: number }>();
  for (const c of allControls) {
    const paName = c.processArea?.name || "Unknown";
    const paId = c.processAreaId;
    if (!paWithControls.has(paId)) paWithControls.set(paId, { id: paId, name: paName, ctrlCount: 0 });
    paWithControls.get(paId)!.ctrlCount++;
  }

  // Build final hierarchy array
  const hierarchy = [...stdMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([stdName, paMap]) => ({
      standard: stdName,
      standardId: stdName.replace(/\s+/g, "_"),
      processAreas: [...paMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([paName, data]) => {
          const paInfo = paWithControls.get(data.paId);
          return {
            id: data.paId,
            name: paName,
            totalControls: data.reqs.reduce((sum, r) => sum + r.controlCount, 0),
            requirements: data.reqs
              .filter((r) => r.controlCount > 0) // Only show requirements with mapped controls
              .sort((a, b) => {
                // Numeric sort
                const parse = (id: string) => {
                  let n = id.replace(/^[A-Za-z]+-/, "").split(/[&\- ]/)[0].trim();
                  return n.split(".").map((s) => { const num = Number(s); return isNaN(num) ? s : num; });
                };
                const va = parse(a.requirementId), vb = parse(b.requirementId);
                for (let i = 0; i < Math.max(va.length, vb.length); i++) {
                  const x = va[i] ?? 0, y = vb[i] ?? 0;
                  if (typeof x === "number" && typeof y === "number" && x !== y) return x - y;
                  if (typeof x === "number") return -1;
                  if (typeof y === "number") return 1;
                  if (String(x) !== String(y)) return String(x).localeCompare(String(y));
                }
                return 0;
              }),
          };
        }).filter((pa) => pa.totalControls > 0),
    }))
    .filter((s) => s.processAreas.length > 0);

  // Flat controls list
  const flatControls = allControls.map((c) => ({
    id: c.id, name: c.name, controlType: c.controlType, processAreaId: c.processAreaId,
  }));

  return NextResponse.json({ hierarchy, allControls: flatControls, totalControls: flatControls.length });
}
