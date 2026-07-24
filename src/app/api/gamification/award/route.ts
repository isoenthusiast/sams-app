import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findApplicableRules, calculatePoints, awardPoints, seedStandardRules, type EventContext } from "@/lib/gamification/ruleEngine";
import { evaluateBadges } from "@/lib/gamification/badgeEngine";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await request.json();
    const { assessmentId, trigger } = body;
    const targetUserId = (session.user as any).id;
    const result = { pointsAwarded: 0, details: [] as string[] };

    // Ensure standard rules exist (idempotent)
    await seedStandardRules();

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

      // Collect role assignments per user (once per role per assessment)
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

      const ctx: EventContext = { assessmentId };

      // ── Conduct Assurance (role-based, via rule engine) ──
      for (const [uid, roles] of awarded) {
        for (const role of roles) {
          const rules = await findApplicableRules("SAMS", "assessment_complete", null, role);
          for (const rule of rules) {
            const match = calculatePoints(rule, 1);
            if (match.adjustedPoints > 0) {
              const awarded = await awardPoints(uid, match, `Conduct Assurance — ${assessment.name}`, ctx);
              result.pointsAwarded += awarded.pointsAwarded;
              result.details.push(`${uid}: Conduct +${awarded.pointsAwarded} (${role})`);
            }
          }
        }
      }

      // ── Domain XP (per-PA, via rule engine) ──
      const controls = (assessment.controlAssignments || []).map(ca => ca.control).filter(Boolean) as any[];
      if (controls.length > 0) {
        const paMap = new Map<string, { name: string; count: number }>();
        for (const c of controls) {
          const paId = c.processArea?.id || "__unknown__";
          if (!paMap.has(paId)) paMap.set(paId, { name: c.processArea?.name || "Unknown", count: 0 });
          paMap.get(paId)!.count++;
        }
        const allUids = new Set(awarded.keys());
        for (const [, pa] of paMap) {
          // Ensure GameAttribute exists for this PA
          let ga = await prisma.gameAttribute.findFirst({ where: { attributeName: pa.name } });
          if (!ga) ga = await prisma.gameAttribute.create({ data: { attributeName: pa.name, attributeDescription: `Auto-created`, attributeStatus: "Active" } });

          // Ensure Domain XP rule exists for this PA
          const existingRule = await prisma.gameAttributeRule.findFirst({
            where: { source: "SAMS", eventType: "assessment_complete", gameAttributeId: ga.id },
          });
          if (!existingRule) {
            await prisma.gameAttributeRule.create({
              data: { source: "SAMS", eventType: "assessment_complete", gameAttributeId: ga.id, basePoints: 1, perUnitPoints: 0, description: `Domain XP for ${pa.name}` },
            });
          }

          const rules = await findApplicableRules("SAMS", "assessment_complete", ga.id, null);
          for (const uid of allUids) {
            for (const rule of rules) {
              const match = calculatePoints(rule, 1);
              if (match.adjustedPoints > 0) {
                const awarded = await awardPoints(uid, match, `Domain XP — ${pa.name}`, ctx);
                result.pointsAwarded += awarded.pointsAwarded;
                result.details.push(`${uid}: ${pa.name} +${awarded.pointsAwarded}`);
              }
            }
          }
        }
      }

      // Evaluate all badges for participating users
      const allUids = new Set(awarded.keys());
      for (const uid of allUids) {
        const badgeResults = await evaluateBadges(uid);
        const newlyEarned = badgeResults.filter(b => b.earned);
        for (const b of newlyEarned) {
          result.details.push(`${uid}: 🏅 ${b.badgeName}${b.level ? ` (${b.level})` : ""}`);
        }
      }

      return NextResponse.json(result);
    }

    if (trigger === "interview_complete") {
      const ctx: EventContext = {};
      const rules = await findApplicableRules("SAMS", "interview_complete", null, "interviewee");
      let awarded = 0;
      for (const rule of rules) {
        const match = calculatePoints(rule, 1);
        if (match.adjustedPoints > 0) {
          const res = await awardPoints(targetUserId, match, "Interview participation", ctx);
          awarded += res.pointsAwarded;
        }
      }
      return NextResponse.json({ pointsAwarded: awarded });
    }

    return NextResponse.json({ pointsAwarded: 0, error: "Unknown trigger" });
  } catch (err: any) {
    console.error("Gamification error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
