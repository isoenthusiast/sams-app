"use client";

import { useState, useEffect } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [justCameBack, setJustCameBack] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      setJustCameBack(true);
      setTimeout(() => setJustCameBack(false), 4000);
    };

    setOffline(!navigator.onLine);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline && !justCameBack) return null;

  return (
    <div
      role="alert"
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium transition-colors ${
        offline
          ? "bg-red-600 text-white"
          : "bg-emerald-700 text-white"
      }`}
    >
      {offline ? "⚠️ You are offline. Changes will be saved when connection is restored." : "✅ Back online!"}
    </div>
  );
}
