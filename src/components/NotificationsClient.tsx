"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { showToast } from "@/components/Toast";

type NotificationRow = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  href: string | null;
};

type NotifResponse = {
  notifications: NotificationRow[];
  unreadCount: number;
  overdueCount: number;
};

const TYPE_META: Record<string, { icon: string }> = {
  EvidenceRequested: { icon: "📨" },
  EvidenceSubmitted: { icon: "📤" },
  EvidenceReviewed: { icon: "📋" },
  CommentShared: { icon: "💬" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * /notifications — in-app notification center (SAMS-006). Client component
 * driving GET /api/notifications (all rows) and POST /api/notifications/mark-read.
 * Renders the computed overdue banner (read-time, synthetic), type icons,
 * deep-links, and per-row / mark-all actions. Reads are userId-scoped server-side.
 */
export function NotificationsClient() {
  const [data, setData] = useState<NotifResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      const json = await res.json();
      setData({
        notifications: Array.isArray(json.notifications) ? json.notifications : [],
        unreadCount: json.unreadCount ?? 0,
        overdueCount: json.overdueCount ?? 0,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load notifications", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "Mark read failed", "error");
      return;
    }
    await load();
  };

  const markAll = async () => {
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "Mark all failed", "error");
      return;
    }
    await load();
  };

  const unread = (data?.notifications ?? []).filter((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">Requests, submissions and shared comments that need your attention.</p>
        </div>
        <Link href="/fla" className="text-sm text-blue-600 hover:underline">← Back</Link>
      </div>

      {!loading && data && data.overdueCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            ⚠️ {data.overdueCount} overdue action{data.overdueCount > 1 ? "s" : ""} awaiting closure.
          </span>
          <Link href="/portal/actions" className="shrink-0 font-medium text-amber-900 underline">View actions</Link>
        </div>
      )}

      {!loading && unread.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button onClick={markAll} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Mark all as read ({data?.unreadCount ?? 0})
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (data?.notifications.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">No notifications yet.</p>
          <p className="mt-1 text-xs text-slate-400">You'll see requests, submissions and shared comments here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data?.notifications.map((n) => {
            const meta = TYPE_META[n.type] ?? { icon: "🔔" };
            const isUnread = !n.readAt;
            return (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${isUnread ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"}`}
              >
                <span className="mt-0.5 text-lg" aria-hidden="true">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{n.title}</span>
                    {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">{relativeTime(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-600">{n.body}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    {n.href && (
                      <Link href={n.href} className="text-xs font-medium text-blue-600 hover:underline">
                        View →
                      </Link>
                    )}
                    {isUnread && (
                      <button onClick={() => markRead(n.id)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
