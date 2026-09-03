"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/useSession";
import { showToast } from "@/components/Toast";

export type CommentAuthor = { id: string; name: string; username?: string | null };
export type ThreadComment = {
  id: string;
  entityType: string;
  entityId: string;
  parentCommentId: string | null;
  author: CommentAuthor | null;
  authorPlane: "Provider" | "Client";
  visibility: "Internal" | "SharedWithClient";
  body: string;
  createdAt: string;
};

type Props = {
  entityType: "Finding" | "EvidenceRequest";
  entityId: string;
  /** Mounted within a company-scoped page; used for empty-state copy. */
  showComposer?: boolean;
};

/**
 * Reusable flat comment thread. Renders:
 *   - author name + plane badge (🛡 provider)
 *   - visibility badge on provider comments (🔒 Internal / 🌐 Shared)
 *   - a composer with a visibility toggle (provider authors only).
 * Client authors cannot choose Internal — the server enforces 400, and the
 * toggle is hidden for them.
 */
export function CommentThread({ entityType, entityId, showComposer = true }: Props) {
  const { user, isAuthenticated, isLoading } = useSession();
  const [comments, setComments] = useState<ThreadComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"Internal" | "SharedWithClient">("Internal");
  const [parentCommentId, setParentCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProvider = !!user?.providerRole;

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comments?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to load comments");
      }
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, body: body.trim(), visibility, parentCommentId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        let msg = d.error || "Failed to post comment";
        if (res.status === 400 && formatPlaneError(d.error)) msg = formatPlaneError(d.error)!;
        throw new Error(msg);
      }
      setBody("");
      setParentCommentId(null);
      showToast("Comment posted", "success");
      await fetchComments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post comment";
      setError(msg);
      showToast(msg, "error");
    }
  };

  const replyTo = (id: string) => {
    setParentCommentId(id === parentCommentId ? null : id);
  };

  if (isLoading) return null;

  const roots = comments.filter((c) => !c.parentCommentId);
  const childrenByParent = (pid: string) => comments.filter((c) => c.parentCommentId === pid);

  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-slate-700">💬 Discussion ({comments.length})</h4>
        {isProvider && <span className="text-[10px] text-slate-400">Provider thread</span>}
      </div>

      {error && <div className="mb-2 text-xs text-red-600" role="alert">{error}</div>}

      <div className="space-y-2">
        {roots.length === 0 && <p className="text-xs text-slate-400">No discussion yet</p>}
        {roots.map((c) => (
          <div key={c.id} className="rounded border border-slate-100 bg-slate-50/50 p-2">
            <CommentRow comment={c} onReply={replyTo} replying={parentCommentId === c.id} canReply={isAuthenticated} isProvider={isProvider} />
            {childrenByParent(c.id).map((c2) => (
              <div key={c2.id} className="ml-4 mt-1 border-l-2 border-slate-200 pl-2">
                <CommentRow comment={c2} onReply={replyTo} replying={false} canReply={false} isProvider={isProvider} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {showComposer && isAuthenticated && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {parentCommentId && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Replying to a thread…</span>
              <button type="button" onClick={() => setParentCommentId(null)} className="text-blue-600 hover:underline">
                Cancel reply
              </button>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={isProvider ? "Add a note (Internal by default)…" : "Add a comment…"}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            aria-label="Comment body"
          />
          <div className="flex items-center justify-between gap-2">
            {isProvider ? (
              <div className="flex items-center gap-1">
                {(["SharedWithClient", "Internal"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      visibility === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    aria-pressed={visibility === v}
                  >
                    {v === "Internal" ? "🔒 Internal" : "🌐 Shared"}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-slate-400">Visible to provider &amp; client</span>
            )}
            <button
              type="submit"
              disabled={!body.trim()}
              className="rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function formatPlaneError(msg?: string): string | null {
  if (!msg) return null;
  if (msg.includes("Internal")) return "Client authors cannot set Internal visibility";
  return null;
}

function CommentRow({ comment, onReply, replying, canReply, isProvider }: {
  comment: ThreadComment;
  onReply: (id: string) => void;
  replying: boolean;
  canReply: boolean;
  isProvider: boolean;
}) {
  const isProviderAuthor = comment.authorPlane === "Provider";
  const showVisibilityBadge = isProviderAuthor;
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-medium text-slate-800">{comment.author?.name ?? "Unknown"}</span>
          {isProviderAuthor && (
            <span className="rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-medium text-emerald-700" title="Provider staff">🛡</span>
          )}
          {showVisibilityBadge && (
            comment.visibility === "Internal" ? (
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500" title="Internal (provider only)">🔒 Internal</span>
            ) : (
              <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] text-blue-600" title="Shared with client">🌐 Shared</span>
            )
          )}
          <span className="text-slate-400">{relativeTime(comment.createdAt)}</span>
        </div>
        <p className="text-xs text-slate-700 whitespace-pre-wrap mt-0.5">{comment.body}</p>
        {canReply && isProvider && (
          <button
            type="button"
            onClick={() => onReply(comment.id)}
            className="mt-0.5 text-[10px] text-blue-600 hover:underline"
          >
            {replying ? "Cancel reply" : "Reply"}
          </button>
        )}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
