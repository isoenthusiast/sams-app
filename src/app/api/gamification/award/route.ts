import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const ROLE_POINTS: Record<string, number> = {
  leadAssessor: 10, assessor: 5, interviewee: 1, auditee: 10, actionParty: 5,
};
const DOMAIN_XP = 1;
const BRONZE_XP = 10;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await request.json();
    const { assessmentId, trigger } = body;
    const targetUserId = (session.user as any).id;
    const result = { pointsAwarded: 0, details: [] as string[] };

    if (trigger === "assessment_complete" && assessmentId) {
      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
          assessorLinks: true,
          aacts: { include: { users: true } },
          controlAssignments: { include: { control: { include: { processArea: true } } } },
          findings: { include: { actions: true, sample: true } },
        },
      });
      if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Track awarded roles per user (once per role per assessment)
      const awarded = new Map<string, Set<string>>();
      const give = (uid: string, role: string) => {
        if (!uid) return;
        if (!awarded.has(uid)) awarded.set(uid, new Set());
        if (awarded.get(uid)!.has(role)) return;
        awarded.get(uid)!.add(role);
      };
      if (assessment.assessorId) give(assessment.assessorId, "leadAssessor");
      for (const l of assessment.assessorLinks || []) give(l.userId, "assessor");
      for (const a of assessment.aacts || []) for (const u of a.users || []) give(u.userId, "interviewee");
      for (const f of assessment.findings || []) for (const a of f.actions || []) if (a.actionParty) give(a.actionParty, "actionParty");

      // Award Conduct Assurance
      for (const [uid, roles] of awarded) {
        let pts = 0;
        for (const r of roles) pts += ROLE_POINTS[r] || 0;
        if (pts > 0) {
          await prisma.pointTransaction.create({ data: { userId: uid, points: pts, reason: `Conduct Assurance — ${assessment.name}`, assessmentId } });
          await prisma.$executeRawUnsafe(`UPDATE "User" SET "totalPoints" = "totalPoints" + $1 WHERE id = $2`, pts, uid);
          result.pointsAwarded += pts;
          result.details.push(`${uid}: Conduct +${pts}`);
        }
      }

      // Domain XP split by PA
      const controls = (assessment.controlAssignments || []).map(ca => ca.control).filter(Boolean) as any[];
      if (controls.length > 0) {
        const paMap = new Map<string, { name: string; count: number }>();
        for (const c of controls) {
          const paId = c.processArea?.id || "__unknown__";
          if (!paMap.has(paId)) paMap.set(paId, { name: c.processArea?.name || "Unknown", count: 0 });
          paMap.get(paId)!.count++;
        }
        const allUids = new Set(awarded.keys());
        for (const [paId, pa] of paMap) {
          let ga = await prisma.gameAttribute.findFirst({ where: { attributeName: pa.name } });
          if (!ga) ga = await prisma.gameAttribute.create({ data: { attributeName: pa.name, attributeDescription: `Auto-created`, attributeStatus: "Active" } });
          for (const uid of allUids) {
            await prisma.pointTransaction.create({ data: { userId: uid, points: DOMAIN_XP, reason: `Domain XP — ${pa.name}`, assessmentId, gameAttributeId: ga.id } });
            await prisma.$executeRawUnsafe(`UPDATE "User" SET "totalPoints" = "totalPoints" + $1 WHERE id = $2`, DOMAIN_XP, uid);
            result.pointsAwarded += DOMAIN_XP;
            result.details.push(`${uid}: ${pa.name} +${DOMAIN_XP}`);
          }
        }
      }

      // Check Bronze badges
      const userPAs = await prisma.$queryRawUnsafe<Array<{ paId: string; paName: string; xp: number }>>(
        `SELECT ga.id as "paId", ga."attributeName" as "paName", COALESCE(SUM(pt.points),0) as xp FROM "GameAttribute" ga LEFT JOIN "PointTransaction" pt ON pt."gameAttributeId"=ga.id AND pt."userId"=$1 GROUP BY ga.id, ga."attributeName"`, targetUserId);
      for (const pa of userPAs) {
        if (pa.xp >= BRONZE_XP) {
          const has = await prisma.userAchievement.findFirst({ where: { userId: targetUserId, badge: { processAreaId: pa.paId, level: "Bronze" } } });
          if (!has) {
            const badge = await prisma.achievementBadge.findFirst({ where: { processAreaId: pa.paId, level: "Bronze", badgeType: "track" } });
            if (badge) {
              await prisma.userAchievement.create({ data: { userId: targetUserId, badgeId: badge.id } });
              result.details.push(`${targetUserId}: 🏅 ${pa.paName} Bronze!`);
            }
          }
        }
      }
      return NextResponse.json(result);
    }

    if (trigger === "interview_complete") {
      const pts = ROLE_POINTS.interviewee;
      await prisma.pointTransaction.create({ data: { userId: targetUserId, points: pts, reason: "Interview participation" } });
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "totalPoints" = "totalPoints" + $1 WHERE id = $2`, pts, targetUserId);
      return NextResponse.json({ pointsAwarded: pts });
    }

    return NextResponse.json({ pointsAwarded: 0, error: "Unknown trigger" });
  } catch (err: any) {
    console.error("Gamification error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
