"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">🔌</div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-slate-500 mb-6">
          The page couldn&apos;t load. This may be due to a temporary connection issue or the server waking up.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-blue-800 px-5 py-2 text-sm font-medium text-white hover:bg-blue-900 transition-colors"
        >
          Try Again
        </button>
        <p className="text-xs text-slate-400 mt-3">
          If this persists, try refreshing the page or waiting a few seconds.
        </p>
      </div>
    </div>
  );
}
