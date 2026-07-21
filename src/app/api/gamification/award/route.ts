import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST — award gamification points and badges
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { userId, trigger } = body;

    const targetUserId = userId || session.user.id;
    const pointsAwarded = trigger === "assessment_complete" ? 50 : 10;

    // Award points
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "totalPoints" = "totalPoints" + $1 WHERE id = $2`,
      pointsAwarded, targetUserId
    );

    // Log point transaction
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PointTransaction" (id, "userId", points, reason, "createdAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      `pt_${Date.now()}`, targetUserId, pointsAwarded, trigger || "manual"
    );

    // Check for badge unlocks
    const badgesAwarded: Array<{ name: string }> = [];

    // First assessment badge
    if (trigger === "assessment_complete") {
      const assessmentCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM "Assessment" WHERE "assessorId" = $1 AND status = 'Completed'`,
        targetUserId
      );
      if (Number(assessmentCount[0]?.count ?? 0) <= 1) {
        // Award "First Assessment" badge
        const badge = await prisma.$queryRawUnsafe<Array<{ id: string; badgeName: string }>>(
          `SELECT id, "badgeName" FROM "AchievementBadge" WHERE "badgeName" = 'First Assessment' LIMIT 1`
        );
        if (badge.length > 0) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "UserAchievement" (id, "userId", "badgeId", "earnedAt")
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT DO NOTHING`,
            `ua_${Date.now()}`, targetUserId, badge[0].id
          );
          badgesAwarded.push({ name: badge[0].badgeName });
        }
      }
    }

    return NextResponse.json({ pointsAwarded, badgesAwarded });
  } catch (error) {
    console.error("Error awarding gamification:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
