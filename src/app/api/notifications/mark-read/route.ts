import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authz";
import { sessionUserId } from "@/lib/conversation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/mark-read
 * Mark the current user's notifications read. Body:
 *   { all: true }                    → mark ALL of the user's unread rows read.
 *   { ids: string[] }                → mark the supplied ids read.
 *
 * TENANT SAFETY (SAMS-005/006 review ruling): unlike a response-side filter,
 * this route EXPLICITLY VERIFIES each supplied id belongs to the SESSION user
 * (recipientUserId === session user) before touching anything. An id that is
 * another user's notification (or does not exist) yields a 403 and leaves every
 * row unchanged — batch ids are the classic cross-tenant leak, so we reject the
 * whole batch rather than silently dropping foreign rows. The updateMany is
 * additionally pinned to `recipientUserId: userId` as a second guard.
 */
export async function POST(request: Request) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const userId = sessionUserId(session) || "";

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { all, ids } = body;

  if (!all && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json(
      { error: "Provide { all: true } or a non-empty { ids: [] }" },
      { status: 400 }
    );
  }

  try {
    if (all) {
      const res = await prisma.notification.updateMany({
        where: { recipientUserId: userId, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ updated: res.count });
    }

    // ids[] — explicit ownership verification before any write.
    const found = await prisma.notification.findMany({
      where: { id: { in: ids } },
      select: { id: true, recipientUserId: true },
    });
    const foundBy = new Map(found.map((n) => [n.id, n.recipientUserId]));
    const foreign = ids.filter((id: string) => foundBy.get(id) !== userId);
    if (foreign.length > 0) {
      // Another user's row (or a non-existent id) — reject the whole batch;
      // nothing is changed.
      return NextResponse.json(
        { error: "Some notification ids do not belong to you", foreign: foreign.length },
        { status: 403 }
      );
    }

    const res = await prisma.notification.updateMany({
      where: { id: { in: ids }, recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ updated: res.count });
  } catch (error) {
    console.error("Error marking notifications read:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
