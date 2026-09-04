import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isProvider } from "@/lib/authz";
import { OnboardingWizard } from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pilot Onboarding Wizard · SAMS",
};

/**
 * /operator/onboarding — Pilot Onboarding Wizard (SAMS-008, Phase 3a, Feature A).
 * Provider-gated: only sessions with `session.user.providerRole` set may drive
 * it (it is an operator motion, not client self-service). Non-provider → 403.
 */
export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) redirect("/login");

  if (!isProvider(session)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">403 — Provider access required</h2>
          <p className="text-sm text-slate-500 mb-6">
            The Pilot Onboarding Wizard is restricted to managed-service provider staff. A client-role-only
            account cannot provision a new tenant.
          </p>
          <a href="/fla" className="text-sm font-medium text-blue-800 hover:underline">
            ← Back to your dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pilot Onboarding Wizard</h1>
        <p className="text-sm text-slate-500">
          Guided, dry-runnable provider motion: create the company → adopt master content → provision users →
          go live.
        </p>
      </div>
      <OnboardingWizard />
    </div>
  );
}
