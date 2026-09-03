import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isProvider } from "@/lib/authz";
import { OperatorConsole } from "@/components/OperatorConsole";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Operator Console · SAMS",
};

/**
 * /operator — cross-client portfolio view (Phase 0 of the managed GRA SaaS
 * roadmap). READ-ONLY. Provider-gated: only sessions with `session.user.providerRole`
 * set may view it. Non-provider (incl. client-role-only Admin) → 403-style view.
 */
export default async function OperatorPage() {
  const session = await auth();

  // Unauthenticated → normal login redirect (can't render a 403 body without a user).
  if (!session?.user) redirect("/login");

  if (!isProvider(session)) {
    return <OperatorAccessDenied />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Operator Console</h1>
        <p className="text-sm text-slate-500">
          Cross-client portfolio — read-only. Click a company to switch context into its workspace.
        </p>
      </div>
      <OperatorConsole />
    </div>
  );
}

function OperatorAccessDenied() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">403 — Provider access required</h2>
        <p className="text-sm text-slate-500 mb-6">
          The Operator Console is restricted to managed-service provider staff. A client-role-only
          account cannot view cross-tenant data.
        </p>
        <a href="/fla" className="text-sm font-medium text-blue-800 hover:underline">
          ← Back to your dashboard
        </a>
      </div>
    </div>
  );
}
