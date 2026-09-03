import Link from "next/link";

/** Guided empty state for a portal user with no company mapping (settled #1). */
export function PortalEmptyState() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 p-10 text-center">
      <div className="text-4xl">🏢</div>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">You aren&apos;t linked to a company</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your account is not associated with a client organisation yet, so there is no assurance data to show here.
        If you believe this is a mistake, contact your lead assessor or the platform administrator.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/profile" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Go to profile
        </Link>
        <Link href="/" className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900">
          Back to home
        </Link>
      </div>
    </div>
  );
}
