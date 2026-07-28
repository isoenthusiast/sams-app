import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT — swap sortOrder with sibling above or below
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json();
  const { direction } = body; // "up" | "down"

  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "direction must be 'up' or 'down'" }, { status: 400 });
  }

  // Get this user's manager and sortOrder
  const users = await prisma.$queryRawUnsafe<Array<{ id: string; sortOrder: number; managerUsername: string | null }>>(
    `SELECT id, "sortOrder", "managerUsername" FROM "User" WHERE id = $1`, id
  );
  if (users.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const user = users[0];
  const mgr = user.managerUsername;

  // Find sibling above or below with same manager
  const op = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const siblings = await prisma.$queryRawUnsafe<Array<{ id: string; sortOrder: number }>>(
    `SELECT id, "sortOrder" FROM "User"
     WHERE "managerUsername" IS NOT DISTINCT FROM $1
       AND "sortOrder" ${op} $2
       AND id != $3
     ORDER BY "sortOrder" ${order}
     LIMIT 1`,
    mgr, user.sortOrder, id
  );

  if (siblings.length === 0) {
    // Already at boundary — no-op
    return NextResponse.json({ swapped: false });
  }

  const sibling = siblings[0];

  // Atomic swap
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "sortOrder" = CASE
       WHEN id = $1 THEN $3
       WHEN id = $2 THEN $4
     END
     WHERE id IN ($1, $2)`,
    user.id, sibling.id, sibling.sortOrder, user.sortOrder
  );

  return NextResponse.json({ swapped: true });
}
