import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authz";
import { sessionUserId } from "@/lib/conversation";
import { resolveNotificationHrefs, resolveNotificationCompanyId, countOverdueActions } from "@/lib/notifications";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_LIST = 100;

/**
 * GET /api/notifications
 * Current user's notifications, NEWEST first. Strictly userId-scoped: the WHERE
 * pins `recipientUserId` to the session user, so another user's rows can NEVER
 * be returned (query-enforced, not a UI filter). Optional `?unread=1` filters to
 * unread rows only.
 *
 * Response is enriched with the read-time bell counts:
 *   - `unreadCount` — count of unread (readAt null) notifications for the user.
 *   - `overdueCount` — COMPUTED (not stored) overdue actions, company-scoped
 *     (Action.targetDate < now AND closureDate null), surfaced as a synthetic
 *     banner entry in the bell/list.
 * Each notification carries a resolved `href` (deep-link) so the UI can land on
 * the right entity without knowing the assessment/role at emit time.
 */
export async function GET(request: Request) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const userId = sessionUserId(session) || "";
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";

  try {
    const rows = await prisma.notification.findMany({
      where: { recipientUserId: userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: MAX_LIST,
      select: {
        id: true,
        type: true,
        entityType: true,
        entityId: true,
        title: true,
        body: true,
        readAt: true,
        companyId: true,
        createdAt: true,
      },
    });

    const [unreadCount, companyId, hrefMap] = await Promise.all([
      prisma.notification.count({ where: { recipientUserId: userId, readAt: null } }),
      resolveNotificationCompanyId(userId),
      resolveNotificationHrefs(rows, userId),
    ]);
    const overdueCount = await countOverdueActions(companyId);

    return NextResponse.json({
      notifications: rows.map((n: any) => ({
        id: n.id,
        type: n.type,
        entityType: n.entityType,
        entityId: n.entityId,
        title: n.title,
        body: n.body,
        readAt: n.readAt,
        companyId: n.companyId,
        createdAt: n.createdAt,
        href: hrefMap.get(n.entityId) ?? "/notifications",
      })),
      unreadCount,
      overdueCount,
    });
  } catch (error) {
    console.error("Error listing notifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
