import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * SAMS-012 — force-password-change (settled decision #4).
 *
 * POST /api/auth/change-password  body { currentPassword, newPassword, confirmPassword }
 *   - Requires an authenticated session (requireAuth).
 *   - Verifies the current password (bcrypt) — wrong → 400.
 *   - New password ≥10 chars and new === confirm — else 400.
 *   - Sets the new passwordHash and CLEARS mustChangePassword (the token is then
 *     refreshed by the client via the NextAuth session update so the middleware
 *     force-gate stops looping).
 *
 * This route is mounted under /api/auth (excluded from the proxy matcher) and is a
 * MORE specific segment than the NextAuth `[...nextauth]` catch-all, so it is
 * reached directly. It is not a NextAuth handler itself.
 */
export async function POST(request: Request) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (newPassword.length < 10) {
    return NextResponse.json({ error: "New password must be at least 10 characters." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "New password and confirmation do not match." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  return NextResponse.json({ ok: true });
}
