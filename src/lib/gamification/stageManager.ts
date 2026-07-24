import { prisma } from "@/lib/prisma";

// ── Stage Definitions ─────────────────────────────────────────────────

interface StageInfo {
  name: string;
  description: string;
}

export const STAGES: Record<number, StageInfo> = {
  0: { name: "Compliance", description: "Traditional audit. Findings → actions → close. No gamification visible." },
  1: { name: "Recognition", description: "Positive feedback appears. People get acknowledged for good work. Personal XP dashboard only." },
  2: { name: "Growth", description: "Assessments become development opportunities. Competency tracks, badges, team leaderboards." },
  3: { name: "Play", description: "Full transformation. Boss fights, missions, self-organized assessments. The playground is alive." },
};

export function getStageInfo(stage: number): StageInfo {
  return STAGES[stage] || { name: "Unknown", description: "" };
}

export type StageNumber = 0 | 1 | 2 | 3;

// ── Stage Management ──────────────────────────────────────────────────

export async function getStage(companyId: string): Promise<{ stage: StageNumber; record: any }> {
  let record = await prisma.gamificationStage.findUnique({ where: { companyId } });
  if (!record) {
    record = await prisma.gamificationStage.create({
      data: { companyId, stage: 0 },
    });
  }
  return { stage: record.stage as StageNumber, record };
}

export async function advanceStage(
  companyId: string,
  advancedBy: string
): Promise<{ success: boolean; fromStage: number; toStage: number; message: string }> {
  const { stage, record } = await getStage(companyId);

  if (stage >= 3) {
    return { success: false, fromStage: stage, toStage: stage, message: "Already at maximum stage (Play)." };
  }

  const nextInfo = getStageInfo(stage + 1);
  const readiness = await checkReadiness(companyId, (stage + 1) as StageNumber);
  if (!readiness.ready) {
    return {
      success: false,
      fromStage: stage,
      toStage: stage,
      message: `Not ready for ${nextInfo.name}. ${readiness.reason}`,
    };
  }

  await prisma.gamificationStage.update({
    where: { id: record.id },
    data: { stage: stage + 1, advancedAt: new Date(), advancedBy },
  });

  return {
    success: true,
    fromStage: stage,
    toStage: stage + 1,
    message: `Advanced to Stage ${stage + 1}: ${nextInfo.name}`,
  };
}

// ── Readiness Detection ───────────────────────────────────────────────

interface ReadinessResult {
  ready: boolean;
  reason: string;
  signals: Record<string, { met: boolean; label: string; detail: string }>;
}

export async function checkReadiness(
  companyId: string,
  targetStage: StageNumber
): Promise<ReadinessResult> {
  const signals: Record<string, { met: boolean; label: string; detail: string }> = {};

  switch (targetStage) {
    case 1: // Compliance → Recognition
      // Manual activation — Admin enables gamification
      signals.adminIntent = {
        met: true,
        label: "Admin Activation",
        detail: "Admin must explicitly enable gamification by advancing to Stage 1.",
      };
      return { ready: true, reason: "Admin-activated.", signals };

    case 2: { // Recognition → Growth
      // 3+ completed assessments with 0 retaliation incidents
      const assessmentCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int as count FROM "Assessment" WHERE "companyId" = $1 AND status = 'Completed'`,
        companyId
      );
      const hasEnough = (assessmentCount[0]?.count || 0) >= 3;
      signals.assessments = {
        met: hasEnough,
        label: "3+ Completed Assessments",
        detail: `${assessmentCount[0]?.count || 0} assessments completed. Need 3+.`,
      };

      // 0 retaliation incidents (placeholder — no retaliation tracking yet)
      signals.noRetaliation = {
        met: true,
        label: "No Retaliation Incidents",
        detail: "No retaliation tracking exists yet. Assumed passed.",
      };

      const allSignalsMet = Object.values(signals).every(s => s.met);
      return {
        ready: allSignalsMet,
        reason: allSignalsMet ? "All signals met." : "Some signals not yet met.",
        signals,
      };
    }

    case 3: { // Growth → Play
      // Assessment requests > scheduled assessments (invite-language)
      const ratio = await prisma.$queryRawUnsafe<Array<{ requested: number; scheduled: number }>>(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'Planned' AND description ILIKE '%request%') as requested,
          COUNT(*) FILTER (WHERE status = 'Planned') as scheduled
         FROM "Assessment" WHERE "companyId" = $1`,
        companyId
      );
      const hasInviteRatio = (ratio[0]?.requested || 0) > 0;
      signals.inviteCulture = {
        met: hasInviteRatio,
        label: "Invite Culture Emerging",
        detail: hasInviteRatio
          ? "Assessment requests detected — people are inviting the assessor in."
          : "No invite-language assessments detected yet. Need people requesting assessments voluntarily.",
      };

      return {
        ready: hasInviteRatio,
        reason: hasInviteRatio ? "Invite culture detected." : "Invite culture not yet detected.",
        signals,
      };
    }

    default:
      return { ready: false, reason: "Invalid target stage.", signals: {} };
  }
}

// ── Feature Toggle ────────────────────────────────────────────────────

/**
 * Check if a feature requiring `requiredStage` is unlocked for the given company.
 * Features at or below the company's current stage are visible.
 */
export function isFeatureUnlocked(companyStage: number, requiredStage: number): boolean {
  return companyStage >= requiredStage;
}

/**
 * Gate a value by stage: return the value if stage >= required, else return fallback.
 */
export function stageGate<T>(companyStage: number, requiredStage: number, value: T, fallback: T): T {
  return companyStage >= requiredStage ? value : fallback;
}
