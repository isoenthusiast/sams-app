import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — bulk-assign managerUsername to all users with a given managerName
export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const { managerName, managerUsername } = body as { managerName?: string; managerUsername?: string | null };

  if (!managerName) {
    return NextResponse.json({ error: "managerName required" }, { status: 400 });
  }

  const newVal = managerUsername?.trim() || null;

  // Also update managerName to the target user's actual name
  let targetName: string | null = null;
  if (newVal) {
    const target = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM "User" WHERE username = $1 LIMIT 1`,
      newVal
    );
    targetName = target[0]?.name ?? null;
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "managerUsername" = $1, "managerName" = COALESCE($3, "managerName") WHERE TRIM("managerName") = $2`,
    newVal, managerName.trim(), targetName
  );

  return NextResponse.json({ ok: true, managerName, managerUsername: newVal });
}
