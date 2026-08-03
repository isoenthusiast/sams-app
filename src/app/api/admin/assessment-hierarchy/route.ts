import { requireAdmin, getSelectedCompanyId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — hierarchical Standard→PA→Requirement→Control tree for assessment creation
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const companyId = await getSelectedCompanyId();

  // Fetch all data in flat queries, then nest
  const [standards, controls] = await Promise.all([
    prisma.standard.findMany({
      where: companyId ? { companyId } : {},
      include: {
        processAreas: {
          where: companyId ? { companyId } : {},
          include: {
            requirements: {
              where: companyId ? { companyId } : {},
              include: {
                controlMappings: {
                  include: {
                    control: {
                      select: { id: true, name: true, controlType: true, controlRef: true },
                    },
                  },
                },
              },
              orderBy: { requirementId: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { sequenceNo: "asc" },
    }),
    prisma.control.findMany({
      where: companyId ? { companyId } : {},
      select: { id: true, name: true, controlType: true, processAreaId: true },
    }),
  ]);

  // Nest into hierarchy
  const hierarchy = standards.map((s) => ({
    standard: s.standard,
    standardId: s.id,
    processAreas: s.processAreas.map((pa) => {
      // All controls in this PA (even unmapped ones)
      const paControls = controls.filter((c) => c.processAreaId === pa.id);
      return {
        id: pa.id,
        name: pa.name,
        totalControls: paControls.length,
        requirements: pa.requirements.map((r) => {
          const mappedControls = r.controlMappings
            .filter((m) => m.control)
            .map((m) => ({
              id: m.control!.id,
              name: m.control!.name,
              controlType: m.control!.controlType,
              mappingId: m.id,
            }));
          return {
            rId: r.rId,
            requirementId: r.requirementId,
            clauseContent: r.clauseContent?.substring(0, 200) || "",
            controls: mappedControls,
            controlCount: mappedControls.length,
          };
        }).filter((r) => r.controlCount > 0 || paControls.length > 0),
      };
    }).filter((pa) => pa.totalControls > 0),
  }));

  // Also return flat controls list for "all controls" view
  const allControls = controls.map((c) => ({
    id: c.id,
    name: c.name,
    controlType: c.controlType,
    processAreaId: c.processAreaId,
  }));

  return NextResponse.json({ hierarchy, allControls, totalControls: allControls.length });
}
