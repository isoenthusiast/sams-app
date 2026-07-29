import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { badgeName, description, badgeType, level, processAreaId, backgroundPrompt, foregroundPrompt, icon, rarity, emotionalDrive, achievementType } = body;
    const badge = await prisma.achievementBadge.update({
      where: { id },
      data: {
        ...(badgeName !== undefined && { badgeName: badgeName?.trim() }),
        ...(description !== undefined && { description }),
        ...(badgeType !== undefined && { badgeType }),
        ...(achievementType !== undefined && { achievementType }),
        ...(emotionalDrive !== undefined && { emotionalDrive }),
        ...(level !== undefined && { level: level || null }),
        ...(processAreaId !== undefined && { processAreaId: processAreaId || null }),
        ...(backgroundPrompt !== undefined && { backgroundPrompt: backgroundPrompt || null }),
        ...(foregroundPrompt !== undefined && { foregroundPrompt: foregroundPrompt || null }),
        ...(icon !== undefined && { icon }),
        ...(rarity !== undefined && { rarity }),
      },
      include: { processArea: { select: { name: true, abbreviatedName: true } } },
    });
    return NextResponse.json(badge);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.achievementBadge.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
