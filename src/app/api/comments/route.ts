import { prisma } from "@/lib/prisma";
import { requireAuth, hasCompanyAccess } from "@/lib/authz";
import {
  sessionPlane,
  sessionUserId,
  sessionName,
  resolveCommentTarget,
  clientVisibleWhere,
  COMMENT_BODY_MAX,
  COMMENT_ENTITY_FINDING,
  COMMENT_ENTITY_EVIDENCE_REQUEST,
} from "@/lib/conversation";
import { NextResponse } from "next/server";
import { notifyCommentShared } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const VALID_ENTITY_TYPES = new Set([COMMENT_ENTITY_FINDING, COMMENT_ENTITY_EVIDENCE_REQUEST]);

/**
 * GET /api/comments?entityType=&entityId=
 * Returns the thread for a polymorphic target, visibility-filtered server-side
 * by the session's plane (settled decision #2):
 *   - provider-plane session → everything on the entity.
 *   - client session → client-authored comments + provider comments that are
 *     SharedWithClient; NEVER provider-Internal.
 * Cross-company target → 403 (a client must not read another company's thread).
 */
export async function GET(request: Request) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  if (!entityType || !entityId || !VALID_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "entityType and entityId required (Finding|EvidenceRequest)" }, { status: 400 });
  }

  const target = await resolveCommentTarget(entityType, entityId);
  if (!target.exists) {
    return NextResponse.json({ error: "Target entity not found" }, { status: 404 });
  }

  // Cross-company gate: a client may only read a thread inside their company.
  // Provider-plane staff may read any company's thread.
  const plane = sessionPlane(session);
  const userId = sessionUserId(session);
  if (plane === "Client" && target.companyId) {
    const ok = await hasCompanyAccess(userId, target.companyId);
    if (!ok) {
      return NextResponse.json({ error: "Access denied for comment target" }, { status: 403 });
    }
  }

  try {
    // Build the WHERE precisely: always pin the entity; a client additionally
    // filters visibility + authorPlane (never provider-Internal). A provider
    // that is also a client-role user must not read another company's thread —
    // handled above via the cross-company gate.
    const baseWhere: Record<string, unknown> = { entityType, entityId };
    if (plane === "Client") {
      baseWhere.OR = clientVisibleWhere().OR;
    }

    const comments = await prisma.comment.findMany({
      where: baseWhere as any,
      include: { author: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      plane,
      comments: comments.map((c: any) => ({
        id: c.id,
        entityType: c.entityType,
        entityId: c.entityId,
        parentCommentId: c.parentCommentId,
        author: c.author ? { id: c.author.id, name: c.author.name, username: c.author.username } : null,
        authorPlane: c.authorPlane,
        visibility: c.visibility,
        body: c.body,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/comments
 * Create a comment on a polymorphic target. authorPlane is derived from the
 * session (providerRole → Provider), NEVER client-supplied. Enforced:
 *   - body required, ≤4000 chars.
 *   - client authors cannot set visibility=Internal → 400.
 *   - cross-company target → 403 (client).
 *   - unauthenticated → 401.
 */
export async function POST(request: Request) {
  const { session, response } = await requireAuth();
  if (response) return response;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { entityType, entityId, parentCommentId, visibility } = body;
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (!entityType || !entityId || !VALID_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "entityType and entityId required (Finding|EvidenceRequest)" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }
  if (text.length > COMMENT_BODY_MAX) {
    return NextResponse.json({ error: `Comment body must be ≤ ${COMMENT_BODY_MAX} characters` }, { status: 400 });
  }

  const plane = sessionPlane(session);
  const userId = sessionUserId(session) || "";

  // Client authors cannot mark a comment Internal-to-provider (400).
  let effectiveVisibility = visibility;
  if (plane === "Client") {
    if (visibility === "Internal") {
      return NextResponse.json({ error: "Client authors cannot set visibility=Internal" }, { status: 400 });
    }
    // Coerce any non-Shared value to SharedWithClient (client-authored comments
    // are always visible to both planes).
    effectiveVisibility = "SharedWithClient";
  } else {
    if (visibility && visibility !== "Internal" && visibility !== "SharedWithClient") {
      return NextResponse.json({ error: "visibility must be Internal or SharedWithClient" }, { status: 400 });
    }
    effectiveVisibility = visibility ?? "Internal";
  }

  const target = await resolveCommentTarget(entityType, entityId);
  if (!target.exists) {
    return NextResponse.json({ error: "Target entity not found" }, { status: 404 });
  }

  // Cross-company gate for clients.
  if (plane === "Client" && target.companyId) {
    const ok = await hasCompanyAccess(userId, target.companyId);
    if (!ok) {
      return NextResponse.json({ error: "Access denied for comment target" }, { status: 403 });
    }
  }

  // Validate parentCommentId belongs to the same thread (flat threads v1).
  if (parentCommentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentCommentId } });
    if (!parent || parent.entityType !== entityType || parent.entityId !== entityId) {
      return NextResponse.json({ error: "parentCommentId does not belong to this thread" }, { status: 400 });
    }
    // Also enforce visibility consistency: a reply must be at least as visible
    // as its parent. v1: keep the reply's requested visibility, but reject
    // downgrading a SharedWithClient thread to Internal for providers.
    if (parent.visibility === "SharedWithClient" && effectiveVisibility === "Internal") {
      effectiveVisibility = "SharedWithClient";
    }
  }

  try {
    const comment = await prisma.comment.create({
      data: {
        entityType,
        entityId,
        parentCommentId: parentCommentId ?? null,
        authorUserId: userId,
        authorPlane: plane,
        visibility: effectiveVisibility,
        body: text,
        companyId: target.companyId,
      },
      include: { author: { select: { id: true, name: true, username: true } } },
    });

    // ── In-App Notifications (SAMS-006) ─────────────────────────────────────
    // A comment becomes client-visible when it is SharedWithClient (client
    // authors are always coerced to SharedWithClient, so ANY client-authored
    // comment qualifies). Notify the entity participants (finding's assessment
    // assessor / request participants), excluding the author. notifyCommentShared
    // never throws, so a notification failure can NEVER fail the comment write.
    if (effectiveVisibility === "SharedWithClient") {
      await notifyCommentShared({
        entityType,
        entityId,
        authorUserId: userId,
        companyId: target.companyId,
        body: text,
      });
    }

    return NextResponse.json(
      {
        comment: {
          id: comment.id,
          entityType: comment.entityType,
          entityId: comment.entityId,
          parentCommentId: comment.parentCommentId,
          author: comment.author ? { id: comment.author.id, name: comment.author.name, username: comment.author.username } : null,
          authorPlane: comment.authorPlane,
          visibility: comment.visibility,
          body: comment.body,
          createdAt: comment.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
