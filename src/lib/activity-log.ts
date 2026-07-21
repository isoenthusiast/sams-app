import { prisma } from "@/lib/prisma";

export interface ActivityLogEntry {
  activityType: string;
  description: string;
  username: string;
  refTable?: string | null;
  refRecord?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

export async function logActivity(entry: ActivityLogEntry): Promise<string | null> {
  try {
    const log = await prisma.activityLog.create({
      data: {
        activityType: entry.activityType,
        description: entry.description,
        username: entry.username,
        refTable: entry.refTable ?? null,
        refRecord: entry.refRecord ?? null,
        beforeData: (entry.beforeData as any) ?? undefined,
        afterData: (entry.afterData as any) ?? undefined,
      },
    });
    return log.id;
  } catch (err) {
    console.error("Failed to log activity:", err);
    return null;
  }
}

export function getUsername(session: { user?: { name?: string | null } } | null): string {
  return (session?.user as { name?: string })?.name ?? "Unknown";
}
