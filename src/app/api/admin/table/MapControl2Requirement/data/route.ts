import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — query MapControl2Requirement by controlId
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const controlId = searchParams.get("controlId");
    const requirementRId = searchParams.get("requirementRId");

    if (!controlId && !requirementRId) {
      return NextResponse.json({ error: "controlId or requirementRId required" }, { status: 400 });
    }

    let rows: any[] = [];
    if (controlId) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, "controlId", "requirementRId", "processAreaId", "createdAt"
         FROM "MapControl2Requirement" WHERE "controlId" = $1`,
        controlId
      );
    } else if (requirementRId) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, "controlId", "requirementRId", "processAreaId", "createdAt"
         FROM "MapControl2Requirement" WHERE "requirementRId" = $1`,
        parseInt(requirementRId, 10)
      );
    }

    return NextResponse.json({ rows, totalRows: rows.length });
  } catch (error) {
    console.error("Error querying MapControl2Requirement:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create a new control-requirement mapping
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { id, controlId, requirementRId } = body;
    if (!controlId || !requirementRId) {
      return NextResponse.json({ error: "controlId and requirementRId required" }, { status: 400 });
    }

    const mappingId = id || `m2r_${Date.now()}_${controlId.slice(-6)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MapControl2Requirement" (id, "controlId", "requirementRId", "createdAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      mappingId, controlId, requirementRId
    );

    return NextResponse.json({ success: true, id: mappingId }, { status: 201 });
  } catch (error) {
    console.error("Error creating MapControl2Requirement:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
