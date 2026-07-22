import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// PUT — update a user
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any)?.role !== "Admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, username, role, companyIds, password } = body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`"name" = $${idx++}`); values.push(name); }
    if (username !== undefined) {
      // Check uniqueness
      const existing = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM "User" WHERE username = $1 AND id != $2`, username, id
      );
      if (existing.length > 0) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      fields.push(`"username" = $${idx++}`); values.push(username);
    }
    if (role !== undefined) {
      const validRoles = ["Admin", "Assessor", "Interviewee"];
      fields.push(`"role" = $${idx++}::"Role"`); values.push(validRoles.includes(role) ? role : "Assessor");
    }
    if (password !== undefined && password !== "") {
      const hash = await bcrypt.hash(password, 10);
      fields.push(`"passwordHash" = $${idx++}`); values.push(hash);
    }

    if (fields.length > 0) {
      values.push(id);
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET ${fields.join(", ")} WHERE id = $${idx}`,
        ...values
      );
    }

    // Sync company assignments
    if (companyIds !== undefined) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "UserCompany" WHERE "userId" = $1`, id
      );
      for (const cid of companyIds) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "UserCompany" (id, "userId", "companyId", "createdAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("userId", "companyId") DO NOTHING`,
          `uc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, id, cid
        );
      }
    }

    // Return updated user
    const updated = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, username, role, "totalPoints" FROM "User" WHERE id = $1`, id
    );

    return NextResponse.json({ user: updated[0] });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — remove a user
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any)?.role !== "Admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { id } = await params;
    const currentUserId = (session.user as any)?.id;

    // Prevent self-delete
    if (id === currentUserId) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id = $1`, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
