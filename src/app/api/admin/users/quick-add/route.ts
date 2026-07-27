import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — quickly add a user with minimal fields (name, username only)
// Used by ManagerAssignmentView to add managers not in the user table
export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const { name, username, companyId } = body as { name?: string; username?: string; companyId?: string };

  if (!name || !username) {
    return NextResponse.json({ error: "name and username required" }, { status: 400 });
  }

  // Check username uniqueness
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name,
      username,
      passwordHash: "$2a$10$placeholder",
      role: "Assessor",
      companyId: companyId || undefined,
      totalPoints: 0,
      dailyPointStreak: 0,
      confidenceInfluencer: false,
    },
  });

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, username: user.username } });
}
