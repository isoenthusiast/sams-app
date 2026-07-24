import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/gamification/certificate
 *
 * Generate a competency certificate for the authenticated user.
 * Returns a certId that can be used to view/print the certificate
 * and a verification URL with QR code.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = (session.user as any).id;
    const certId = `CERT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

    // Ensure Certificate table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Certificate" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
        "certId" TEXT NOT NULL UNIQUE,
        "generatedAt" TIMESTAMP DEFAULT NOW(),
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Store certificate record
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Certificate" (id, "userId", "certId", "generatedAt", "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())`,
      userId, certId
    );

    return NextResponse.json({
      success: true,
      certId,
      url: `/gamification/certificate/${certId}`,
      verifyUrl: `/verify/${certId}`,
    });
  } catch (err: any) {
    console.error("[certificate] Error:", err);
    return NextResponse.json({ error: "Failed to generate certificate" }, { status: 500 });
  }
}
