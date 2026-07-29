import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const badges = await prisma.achievementBadge.findMany({
      include: { processArea: { select: { name: true, abbreviatedName: true } } },
      orderBy: { badgeName: "asc" },
    });
    return NextResponse.json(badges);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { badgeName, description, badgeType, level, processAreaId, backgroundPrompt, foregroundPrompt, icon, rarity, emotionalDrive, achievementType } = body;
    const badge = await prisma.achievementBadge.create({
      data: {
        badgeName: badgeName?.trim() || "New Badge",
        description: description || "",
        badgeType: badgeType || "track",
        achievementType: achievementType || "track",
        emotionalDrive: emotionalDrive || "Development",
        level: level || null,
        processAreaId: processAreaId || null,
        backgroundPrompt: backgroundPrompt || null,
        foregroundPrompt: foregroundPrompt || null,
        icon: icon || "🏅",
        rarity: rarity || "Common",
      },
      include: { processArea: { select: { name: true, abbreviatedName: true } } },
    });
    return NextResponse.json(badge, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
