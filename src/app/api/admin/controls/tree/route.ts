import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";

const ISO_STANDARD_NAME = "International Standards (ISO)";

// GET /api/admin/controls/tree
// Returns all controls organized as:
//   Standard → ProcessArea → Requirement → Control
//
// Non-ISO PAs: each control appears under its home PA only (no duplicates).
// ISO PAs: controls mapped to ISO requirements appear here regardless of
// their home PA (many-to-many certification mapping).
export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const companyId = await getSelectedCompanyId();

  // Fetch all process areas with their standard, requirements, and mapped controls
  const processAreas = await prisma.processArea.findMany({
    where: companyId ? { companyId } : {},
    include: {
      standardRef: { select: { standard: true } },
      requirements: {
        orderBy: { requirementId: "asc" },
        include: {
          controlMappings: {
            include: {
              control: {
                select: { id: true, name: true, controlType: true, processAreaId: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Build the tree
  // Group by standard name
  const standardMap = new Map<
    string,
    {
      standard: string;
      isIso: boolean;
      processAreas: Map<
        string,
        {
          id: string;
          name: string;
          requirements: Array<{
            rId: number;
            requirementId: string;
            clauseContent: string | null;
            controls: Array<{
              id: string;
              name: string;
              controlType: string;
              homePaId: string | null;
            }>;
          }>;
        }
      >;
    }
  >();

  for (const pa of processAreas) {
    const standard = pa.standardRef?.standard ?? "Other";
    const isIso = standard === ISO_STANDARD_NAME;

    if (!standardMap.has(standard)) {
      standardMap.set(standard, {
        standard,
        isIso,
        processAreas: new Map(),
      });
    }

    const stdEntry = standardMap.get(standard)!;
    if (!stdEntry.processAreas.has(pa.id)) {
      stdEntry.processAreas.set(pa.id, {
        id: pa.id,
        name: pa.name,
        requirements: [],
      });
    }

    const paEntry = stdEntry.processAreas.get(pa.id)!;

    for (const req of pa.requirements) {
      const controls = req.controlMappings.map((m) => ({
        id: m.control.id,
        name: m.control.name,
        controlType: m.control.controlType,
        homePaId: m.control.processAreaId,
      }));

      if (controls.length > 0) {
        paEntry.requirements.push({
          rId: req.rId,
          requirementId: req.requirementId,
          clauseContent: req.clauseContent,
          controls,
        });
      }
    }
  }

  // Also fetch controls that belong to each PA but have NO requirement mappings
  // (these appear as "Unmapped" under their home PA in the tree)
  const unmappedControls = await prisma.control.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      // Only include controls that have no MapControl2Requirement entries
      requirementMappings: { none: {} },
    },
    select: {
      id: true,
      name: true,
      controlType: true,
      processAreaId: true,
      processArea: { select: { name: true } },
    },
  });

  // Add unmapped controls to their home PA in the tree under a synthetic "__unmapped__" requirement
  for (const ctrl of unmappedControls) {
    const pa = processAreas.find((p) => p.id === ctrl.processAreaId);
    if (!pa) continue;

    const standard = pa.standardRef?.standard ?? "Other";
    const stdEntry = standardMap.get(standard);
    if (!stdEntry) continue;

    const paEntry = stdEntry.processAreas.get(pa.id);
    if (!paEntry) continue;

    // Check if unmapped section already exists for this PA
    let unmappedReq = paEntry.requirements.find((r) => r.requirementId === "__unmapped__");
    if (!unmappedReq) {
      unmappedReq = {
        rId: -1, // sentinel
        requirementId: "__unmapped__",
        clauseContent: "Controls not yet mapped to any requirement",
        controls: [],
      };
      paEntry.requirements.push(unmappedReq);
    }

    // Deduplicate: don't add the same control twice
    if (!unmappedReq.controls.some((c) => c.id === ctrl.id)) {
      unmappedReq.controls.push({
        id: ctrl.id,
        name: ctrl.name,
        controlType: ctrl.controlType,
        homePaId: ctrl.processAreaId,
      });
    }
  }

  // Serialize to plain arrays, sorted
  const standards = [...standardMap.entries()]
    .sort(([a], [b]) => {
      // ISO always last
      if (a === ISO_STANDARD_NAME) return 1;
      if (b === ISO_STANDARD_NAME) return -1;
      return a.localeCompare(b);
    })
    .map(([standard, entry]) => ({
      standard,
      isIso: entry.isIso,
      processAreas: [...entry.processAreas.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, pa]) => ({
          ...pa,
          requirements: pa.requirements
            .filter((r) => r.controls.length > 0)
            .sort((a, b) => {
              // Unmapped always last within a PA
              if (a.requirementId === "__unmapped__") return 1;
              if (b.requirementId === "__unmapped__") return -1;
              return a.requirementId.localeCompare(b.requirementId);
            }),
        })),
    }));

  return NextResponse.json(JSON.parse(JSON.stringify({ standards })));
}
