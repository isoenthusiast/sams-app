"use client";

import { useEffect, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

type Toast = { id: number; message: string; type: ToastType };

let toastId = 0;
let globalSetToasts: ((updater: (prev: Toast[]) => Toast[]) => void) | null = null;

/** Show a toast from anywhere — no React context needed. */
export function showToast(message: string, type: ToastType = "info") {
  const id = ++toastId;
  globalSetToasts?.((prev) => [...prev, { id, message, type }]);
  setTimeout(() => {
    globalSetToasts?.((prev) => prev.filter((t) => t.id !== id));
  }, 4000);
}

const typeStyles: Record<ToastType, string> = {
  success: "border-emerald-400 bg-emerald-50 text-emerald-800",
  error: "border-red-400 bg-red-50 text-red-800",
  info: "border-blue-400 bg-blue-50 text-blue-800",
  warning: "border-amber-400 bg-amber-50 text-amber-800",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    globalSetToasts = setToasts as any;
    return () => { globalSetToasts = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-md border px-4 py-3 text-sm shadow-lg animate-in ${typeStyles[t.type]}`}>
          {t.type === "success" && "✅ "}
          {t.type === "error" && "❌ "}
          {t.type === "warning" && "⚠️ "}
          {t.type === "info" && "ℹ️ "}
          {t.message}
        </div>
      ))}
    </div>
  );
}
