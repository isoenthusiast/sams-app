"use client";

import { useState, FormEvent, useEffect } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ssoPending, setSsoPending] = useState(false);

  // SAMS-012: surface an SSO link-by-email denial ("contact your administrator")
  // from the ?error=sso_* query param the signIn callback redirects to. Uses
  // window.location (not useSearchParams) to avoid a Suspense boundary requirement.
  useEffect(() => {
    const errorParam = new URLSearchParams(window.location.search).get("error");
    if (errorParam === "sso_account_not_found") {
      setSsoError(
        "Sign-in was denied. Your Microsoft account is not linked to an active SAMS user. Contact your administrator."
      );
    }
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const username = (formData.get("username") as string) ?? "";
    const password = (formData.get("password") as string) ?? "";

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid username or password.");
        setPending(false);
      } else {
        // The proxy re-routes a forced-change user to /change-password.
        window.location.href = "/";
      }
    } catch {
      setError("Sign in failed. Please try again.");
      setPending(false);
    }
  };

  const handleSso = async () => {
    setSsoPending(true);
    setError(null);
    setSsoError(null);
    // OAuth redirect — lands back in this app via /api/auth/callback/... and then
    // either a session (link-by-email match) or the ?error=sso_* denial.
    await signIn("microsoft-entra-id", { callbackUrl: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">SAMS</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>

        {/* SAMS-012: SSO — "Sign in with Microsoft" above the credentials form. */}
        <button
          type="button"
          onClick={handleSso}
          disabled={ssoPending}
          className="flex w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
            <rect x="1" y="1" width="10" height="10" fill="#f35325" />
            <rect x="12" y="1" width="10" height="10" fill="#81bc06" />
            <rect x="1" y="12" width="10" height="10" fill="#05a6f0" />
            <rect x="12" y="12" width="10" height="10" fill="#ffba08" />
          </svg>
          {ssoPending ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
        </button>

        {ssoError && (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">{ssoError}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or with your SAMS credentials
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form method="post" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="username" className="text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
