"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BellState = {
  unreadCount: number;
  overdueCount: number;
};

const POLL_MS = 30000;

/**
 * NavBar notification bell (SAMS-006). Client component — fetches the
 * current user's unread notifications on mount and on a light poll; shows an
 * unread-count badge and links to `/notifications`. The bell is rendered only
 * on the shared app chrome (NavBar), NOT on portal/operator surfaces (out of
 * scope). Read side is userId-scoped server-side; this only displays counts the
 * server already scoped to the session user.
 */
export function NotificationBell() {
  const [state, setState] = useState<BellState>({ unreadCount: 0, overdueCount: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications?unread=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setState({ unreadCount: data.unreadCount ?? 0, overdueCount: data.overdueCount ?? 0 });
          setLoaded(true);
        }
      } catch {
        /* ignore — keep the badge stable */
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const total = state.unreadCount + state.overdueCount;

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications — ${state.unreadCount} unread${state.overdueCount ? `, ${state.overdueCount} overdue action${state.overdueCount > 1 ? "s" : ""}` : ""}`}
      title={`Notifications — ${state.unreadCount} unread${state.overdueCount ? `, ${state.overdueCount} overdue` : ""}`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {loaded && total > 0 && (
        <span
          className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
            state.overdueCount > 0 ? "bg-amber-500 text-white" : "bg-red-600 text-white"
          }`}
        >
          {total > 99 ? "99+" : total}
        </span>
      )}
    </Link>
  );
}
