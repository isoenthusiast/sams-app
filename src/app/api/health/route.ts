import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Basic connectivity check
    const dbOk = await prisma.$queryRawUnsafe<Array<{ ok: number }>>(`SELECT 1 as ok`);
    const userCount = await prisma.user.count();
    const controlCount = await prisma.control.count();

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      app: "sams-app",
      database: "connected",
      stats: {
        users: userCount,
        controls: controlCount,
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      timestamp: new Date().toISOString(),
      app: "sams-app",
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
