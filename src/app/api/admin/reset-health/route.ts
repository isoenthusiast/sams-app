import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function nextQuarterStart(): Date {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const nextQ = (q + 1) % 4;
  const year = now.getFullYear() + (nextQ === 0 ? 1 : 0);
  return new Date(year, nextQ * 3, 1);
}

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  try {
    const last = await prisma.activityLog.findFirst({
      where: { activityType: "health_reset" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    return NextResponse.json({
      lastReset: last?.timestamp?.toISOString() ?? null,
      nextReset: nextQuarterStart().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  try {
    const result = await prisma.$executeRawUnsafe(`UPDATE "Control" SET "rawHealthScore" = 0`);
    await prisma.activityLog.create({
      data: {
        activityType: "health_reset",
        description: `Health scores reset to 0 by ${session.user.name || "Admin"}. ${result} controls affected.`,
        username: session.user.name || "admin",
        refTable: "Control",
      },
    });
    return NextResponse.json({ success: true, updated: result, nextReset: nextQuarterStart().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
