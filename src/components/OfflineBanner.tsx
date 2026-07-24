"use client";

import { useState, useEffect } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [justCameBack, setJustCameBack] = useState(false);
  const [pendingSyncs, setPendingSyncs] = useState(0);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      setJustCameBack(true);
      setTimeout(() => setJustCameBack(false), 4000);
      processQueue();
    };

    setOffline(!navigator.onLine);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    // Register service worker
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SYNC_MUTATIONS") processQueue();
      });
    }

    checkQueue();

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const checkQueue = () => {
    try {
      const queue = JSON.parse(localStorage.getItem("sams_offline_queue") || "[]");
      setPendingSyncs(queue.length);
    } catch { /* ignore */ }
  };

  const processQueue = async () => {
    if (!navigator.onLine) return;
    try {
      const queue = JSON.parse(localStorage.getItem("sams_offline_queue") || "[]");
      if (queue.length === 0) return;
      const successes: number[] = [];
      for (let i = 0; i < queue.length; i++) {
        try {
          const item = queue[i];
          const res = await fetch(item.url, {
            method: item.method,
            headers: { "Content-Type": "application/json" },
            body: item.body ? JSON.stringify(item.body) : undefined,
          });
          if (res.ok) successes.push(i);
        } catch { /* retry next time */ }
      }
      const remaining = queue.filter((_: any, i: number) => !successes.includes(i));
      localStorage.setItem("sams_offline_queue", JSON.stringify(remaining));
      setPendingSyncs(remaining.length);
    } catch { /* ignore */ }
  };

  if (!offline && !justCameBack && pendingSyncs === 0) return null;

  return (
    <div
      role="alert"
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium transition-colors ${
        offline
          ? "bg-red-600 text-white"
          : pendingSyncs > 0
            ? "bg-yellow-600 text-white"
            : "bg-emerald-700 text-white"
      }`}
    >
      {offline
        ? "📡 You are offline. Changes saved locally."
        : pendingSyncs > 0
          ? `📤 Syncing ${pendingSyncs} change${pendingSyncs !== 1 ? "s" : ""}…`
          : "✅ Back online!"}
    </div>
  );
}

/**
 * Queue a mutation for offline-first operation.
 * Executes immediately if online; queues in localStorage if offline.
 */
export async function queueOfflineMutation(
  url: string,
  method: string,
  body?: Record<string, any>
): Promise<{ success: boolean; queued: boolean }> {
  if (navigator.onLine) {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { success: response.ok, queued: false };
    } catch {
      // Fall through to queue
    }
  }

  try {
    const queue = JSON.parse(localStorage.getItem("sams_offline_queue") || "[]");
    queue.push({ url, method, body, timestamp: Date.now() });
    localStorage.setItem("sams_offline_queue", JSON.stringify(queue));
  } catch { /* ignore */ }

  return { success: true, queued: true };
}
