import { requireAdmin, logActivity } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// POST — create a new user
export async function POST(request: Request) {
  try {
    const { session, response } = await requireAdmin();
    if (response) return response;

    const body = await request.json();
    const { name, username, password, role, companyIds } = body;

    if (!name || !username || !password) {
      return NextResponse.json({ error: "name, username, and password are required" }, { status: 400 });
    }

    // Check username uniqueness
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const validRoles = ["Admin", "Superuser", "Assessor", "Interviewee"];
    const userRole = validRoles.includes(role) ? role : "Assessor";

    const user = await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, name, username, "passwordHash", role, "createdAt")
       VALUES ($1, $2, $3, $4, $5::"Role", NOW())
       RETURNING id, name, username, role, "totalPoints"`,
      `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name, username, passwordHash, userRole
    );

    // Get the created user ID
    const created = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "User" WHERE username = $1`, username
    );
    const userId = created[0]?.id;
    if (!userId) throw new Error("User creation failed");

    // Assign companies
    if (companyIds && companyIds.length > 0) {
      for (const cid of companyIds) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "UserCompany" (id, "userId", "companyId", "createdAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("userId", "companyId") DO NOTHING`,
          `uc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, userId, cid
        );
      }
    }

    // Fetch the full user to return
    const fullUser = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, username, role, "totalPoints" FROM "User" WHERE id = $1`, userId
    );

    await logActivity({
      userId: (session.user as { id?: string }).id || "unknown",
      username: (session.user as { name?: string }).name || "unknown",
      action: "CREATE",
      entityType: "User",
      entityId: userId,
      summary: `Created user: ${username} (${userRole})`,
      metadata: { role: userRole, name },
    });

    return NextResponse.json({ user: fullUser[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
