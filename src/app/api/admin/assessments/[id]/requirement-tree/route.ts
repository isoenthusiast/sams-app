import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";
import { ACTIVE_CONTENT_WHERE } from "@/lib/content-rollforward";

// GET /api/admin/assessments/[id]/requirement-tree
// Returns Standard → ProcessArea → Requirement → Control tree for the assessment.
// Shows ALL requirements even those with zero controls (Principle #32).
// Includes assignedControlIds for checkbox state and otherRequirements for multi-location popups.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: assessmentId } = await params;
  const companyId = await getSelectedCompanyId();

  // Verify assessment exists
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, ...(companyId ? { companyId } : {}) },
    select: { id: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  // Get assigned control IDs + effectiveness + test data
  const assignments = await prisma.controlAssignment.findMany({
    where: { assessmentId },
    select: { controlId: true, effective: true, effectiveUpdatedAt: true, testNotes: true, testMethod: true },
  });
  const assignedControlIds = assignments.map((a) => a.controlId);
  const controlEffectiveness: Record<string, { effective: string | null; updatedAt: string | null; testNotes: string | null; testMethod: string | null }> = {};
  for (const a of assignments) {
    controlEffectiveness[a.controlId] = {
      effective: a.effective,
      updatedAt: a.effectiveUpdatedAt?.toISOString() ?? null,
      testNotes: a.testNotes,
      testMethod: a.testMethod,
    };
  }

  // Get requirement conclusions for this assessment
  const conclusions = await prisma.requirementConclusion.findMany({
    where: { assessmentId },
    select: { requirementRId: true, conclusion: true, narrative: true, lastAssessedDate: true },
  });
  const requirementConclusions: Record<number, { conclusion: string; narrative: string | null; lastAssessedDate: string | null }> = {};
  for (const c of conclusions) {
    requirementConclusions[c.requirementRId] = {
      conclusion: c.conclusion,
      narrative: c.narrative,
      lastAssessedDate: c.lastAssessedDate?.toISOString() ?? null,
    };
  }

  // Fetch all requirements with processArea → standard, ordered
  const requirements = await prisma.requirement.findMany({
    where: companyId ? { companyId } : {},
    include: {
      processArea: {
        include: {
          standardRef: { select: { id: true, standard: true } },
        },
      },
      controlMappings: {
        include: {
          control: {
            select: {
              id: true,
              name: true,
              controlType: true,
            },
          },
        },
      },
    },
    orderBy: [
      { processArea: { standardRef: { standard: "asc" } } },
      { processArea: { name: "asc" } },
      { requirementId: "asc" },
    ],
  });

  // Fetch controls that have NO requirement mappings (unmapped controls)
  const unmappedControls = await prisma.control.findMany({
    where: {
      ...ACTIVE_CONTENT_WHERE,
      ...(companyId ? { companyId } : {}),
      requirementMappings: { none: {} },
    },
    select: {
      id: true,
      name: true,
      controlType: true,
    },
    orderBy: { name: "asc" },
  });

  // Build the tree: Standard → ProcessArea → Requirement → Control
  // Also build a reverse index: controlId → list of (requirementId, processAreaName)
  const controlLocations = new Map<string, Array<{ requirementId: string; processAreaName: string }>>();

  interface TreeRequirement {
    rId: number;
    requirementId: string;
    clauseContent: string;
    controls: TreeControl[];
  }

  interface TreeControl {
    id: string;
    name: string;
    controlType: string;
    isAssigned: boolean;
  }

  interface TreeProcessArea {
    name: string;
    requirements: TreeRequirement[];
  }

  interface TreeStandard {
    standard: string;
    processAreas: TreeProcessArea[];
  }

  const stdMap = new Map<string, Map<string, TreeRequirement[]>>();
  // stdMap: standardName → processAreaName → requirements[]

  for (const req of requirements) {
    const stdName = req.processArea?.standardRef?.standard ?? "Other";
    const paName = req.processArea?.name ?? "Unknown";

    if (!stdMap.has(stdName)) {
      stdMap.set(stdName, new Map());
    }
    const paMap = stdMap.get(stdName)!;
    if (!paMap.has(paName)) {
      paMap.set(paName, []);
    }

    const controls: TreeControl[] = req.controlMappings.map((m) => {
      // Track where each control appears
      if (!controlLocations.has(m.control.id)) {
        controlLocations.set(m.control.id, []);
      }
      const locs = controlLocations.get(m.control.id)!;
      const alreadyTracked = locs.some(
        (l) => l.requirementId === req.requirementId
      );
      if (!alreadyTracked) {
        locs.push({
          requirementId: req.requirementId,
          processAreaName: paName,
        });
      }

      return {
        id: m.control.id,
        name: m.control.name,
        controlType: m.control.controlType,
        isAssigned: assignedControlIds.includes(m.control.id),
      };
    });

    paMap.get(paName)!.push({
      rId: req.rId,
      requirementId: req.requirementId,
      clauseContent: req.clauseContent,
      controls,
    });
  }

  // Build the final tree array
  const standards: TreeStandard[] = [];
  for (const [stdName, paMap] of stdMap) {
    const processAreas: TreeProcessArea[] = [];
    for (const [paName, reqs] of paMap) {
      processAreas.push({ name: paName, requirements: reqs });
    }
    // Sort process areas by name
    processAreas.sort((a, b) => a.name.localeCompare(b.name));
    standards.push({ standard: stdName, processAreas });
  }
  // Sort standards by name
  standards.sort((a, b) => a.standard.localeCompare(b.standard));

  // Build otherRequirements for each control (exclude the "current" requirement)
  // We compute this client-side since we don't know which requirement is "current"
  // when viewing a control — we pass the full location map
  const controlLocationsForClient: Record<
    string,
    Array<{ requirementId: string; processAreaName: string }>
  > = {};
  for (const [ctrlId, locs] of controlLocations) {
    controlLocationsForClient[ctrlId] = locs;
  }

  return NextResponse.json({
    standards,
    assignedControlIds,
    controlEffectiveness,
    requirementConclusions,
    unmappedControls: unmappedControls.map((c) => ({
      id: c.id,
      name: c.name,
      controlType: c.controlType,
      isAssigned: assignedControlIds.includes(c.id),
    })),
    controlLocations: controlLocationsForClient,
  });
}
