import { requireAdmin, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { ACTIVE_CONTENT_WHERE } from "@/lib/content-rollforward";
import { NextResponse } from "next/server";

// GET — hierarchical Standard→PA→Requirement→Control tree for assessment creation
// NOTE: Groups by Requirement.standard (not Standard.standard) because ISO requirements
// reference ProcessAreas that belong to Shell-specific standards, not ISO standards.
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const companyId = await getSelectedCompanyId();
  const where = { ...ACTIVE_CONTENT_WHERE, ...(companyId ? { companyId } : {}) };

  // Fetch requirements with their PA, standard, and control mappings
  const requirements = await prisma.requirement.findMany({
    where,
    include: {
      processArea: { select: { id: true, name: true } },
      controlMappings: {
        where: { control: ACTIVE_CONTENT_WHERE },
        include: {
          control: { select: { id: true, name: true, controlType: true } },
        },
      },
    },
    orderBy: { requirementId: "asc" },
  });

  // Also get all ACTIVE controls with their PA for unmapped controls
  const allControls = await prisma.control.findMany({
    where,
    select: { id: true, name: true, controlType: true, processAreaId: true, processArea: { select: { name: true } } },
  });

  // Build hierarchy: Standard → PA → Requirement → Controls
  // ISO standards (14001, 45001, 9001, etc.) are nested under "International Standards (ISO)"
  const ISO_PARENT = "International Standards (ISO)";
  const stdMap = new Map<string, Map<string, { reqs: any[]; paId: string }>>();
  
  for (const r of requirements) {
    // Normalize standard name — strip invisible Unicode and whitespace
    const rawStd = (r.standard || "Unknown").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    const isIso = /ISO\s+\d{4,5}/i.test(rawStd) || /ICOP\s+PMS/i.test(rawStd) || rawStd === "SMDS ICOP PMS";
    const stdName = isIso ? ISO_PARENT : rawStd;
    
    // For ISO standards, the standard name becomes the ProcessArea
    // For non-ISO, use the actual processArea name
    const paName = isIso 
      ? rawStd.replace("Environmental Management System (EMS)", "EMS").replace("Quality Management System (QMS)", "QMS").replace("Occupational Health and Safety Standard", "OHSMS").replace("Business Continuity Management System", "BCMS").trim()
      : (r.processArea?.name || "Unknown");
    const paId = isIso ? `iso_pa_${rawStd.replace(/\s+/g, "_")}` : (r.processArea?.id || "");

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

  // Build final hierarchy array
  const hierarchy: any[] = [];
  for (const [stdName, paMap] of [...stdMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const pas: any[] = [];
    for (const [paName, data] of [...paMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (data.reqs.length === 0) continue; // skip PAs with no requirements at all
      const totalControls = data.reqs.reduce((sum: number, r: any) => sum + r.controlCount, 0);
      const requirements = data.reqs
        .filter((r: any) => r.controlCount > 0) // Only show requirements with mapped controls
        .sort((a: any, b: any) => {
          const parse = (id: string) => {
            const n = id.replace(/^[A-Za-z]+-/, "").split(/[&\- ]/)[0].trim();
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
        });
      pas.push({ id: data.paId, name: paName, totalControls, requirements });
    }
    if (pas.length > 0) {
      hierarchy.push({ standard: stdName, standardId: stdName.replace(/\s+/g, "_"), processAreas: pas });
    }
  }

  // Flat controls list
  const flatControls = allControls.map((c) => ({
    id: c.id, name: c.name, controlType: c.controlType, processAreaId: c.processAreaId,
  }));

  return NextResponse.json({ hierarchy, allControls: flatControls, totalControls: flatControls.length });
}
