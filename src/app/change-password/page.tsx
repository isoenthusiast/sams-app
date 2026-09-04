"use client";

import { useState, FormEvent } from "react";
import { useSession } from "next-auth/react";

/**
 * SAMS-012 — force-password-change page (settled decision #4).
 *
 * Reached from the middleware gate after a credentials login by a user with
 * `mustChangePassword`. Verifies the CURRENT password, then sets the NEW one
 * (≥10 chars, confirmed), clears the DB flag, refreshes the session JWT (so the
 * middleware no longer loops), and continues to the app. Direct-URL bypass is
 * handled by src/proxy.ts (redirects back here).
 */
export default function ChangePasswordPage() {
  const { update } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const currentPassword = (formData.get("currentPassword") as string) ?? "";
    const newPassword = (formData.get("newPassword") as string) ?? "";
    const confirmPassword = (formData.get("confirmPassword") as string) ?? "";

    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      setPending(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      setPending(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Password change failed. Please try again.");
        setPending(false);
        return;
      }

      // Refresh the session JWT so the middleware sees the cleared flag and stops
      // forcing this user back onto /change-password. Pass a body so the client
      // POSTs (a bare update() does a GET and would NOT re-encode the token).
      await update({});
      window.location.href = "/";
    } catch {
      setError("Password change failed. Please try again.");
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        method="post"
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Change your password</h1>
          <p className="text-sm text-slate-500">
            For security you must set a new password before continuing.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="currentPassword" className="text-sm font-medium text-slate-700">
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="newPassword" className="text-sm font-medium text-slate-700">
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <p className="text-xs text-slate-400">At least 10 characters.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
