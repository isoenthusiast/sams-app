import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  try {
    // Overall XP
    const total = await prisma.pointTransaction.aggregate({ where: { userId }, _sum: { points: true } });
    const overallXP = total._sum.points || 0;

    // Latest non-Assurance track gained
    const latestDomain = await prisma.pointTransaction.findFirst({
      where: { userId, reason: { startsWith: "Domain XP" }, gameAttributeId: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { gameAttribute: { select: { attributeName: true } } },
    });

    // All tracks with levels — cast SUM to INTEGER to avoid BigInt serialization error
    const trackData = await prisma.$queryRawUnsafe<Array<{ paName: string; xp: number; level: string }>>(
      `SELECT ga."attributeName" as "paName", COALESCE(SUM(pt.points)::int, 0) as xp,
              CASE
                WHEN COALESCE(SUM(pt.points), 0) >= 100 THEN 'Silver'
                WHEN COALESCE(SUM(pt.points), 0) >= 10 THEN 'Bronze'
                ELSE 'Observer'
              END as level
       FROM "GameAttribute" ga
       LEFT JOIN "PointTransaction" pt ON pt."gameAttributeId" = ga.id AND pt."userId" = $1
       WHERE ga."attributeStatus" = 'Active'
       GROUP BY ga."attributeName"
       ORDER BY xp DESC`,
      userId
    );

    // Ensure all BigInt values are converted to Number before JSON serialization
    const serializable = {
      overallXP: Number(overallXP),
      latestTrack: latestDomain?.gameAttribute?.attributeName || null,
      latestTrackXP: Number(latestDomain?.points || 0),
      tracks: trackData.map((t: any) => ({
        paName: t.paName,
        xp: Number(t.xp),
        level: t.level,
      })),
    };

    return NextResponse.json(serializable);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
