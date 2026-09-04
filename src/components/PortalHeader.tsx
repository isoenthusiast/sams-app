"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "./SignOutButton";
import type { PortalCompany } from "@/lib/portal";

const TABS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/portal", label: "Overview", exact: true },
  { href: "/portal/findings", label: "Findings" },
  { href: "/portal/actions", label: "Actions" },
  { href: "/portal/requests", label: "Requests" },
  { href: "/portal/activity", label: "Activity" },
];
/**
 * SAMS-010 white-label theming (settled decision #2): the portal chrome picks up
 * the ACTIVE company's `logoUrl` + `primaryColor`. The logo replaces the text
 * mark with a silent text fallback on load failure (never a broken image); the
 * primary colour drives the accent via a `--brand` CSS variable set on
 * <html> and applied to the active nav tab. The header is portal-only, so the
 * operator app (root layout) stays SAMS-branded — the `--brand` override is
 * cleaned up when this header unmounts.
 *
 * The active company is the one resolved in the layout (server) and selected
 * client-side via ?companyId= / first-company. Theme is attached per-company on
 * the server (scope-by-construction), so company A's theme never renders on
 * company B's portal.
 */
export function PortalHeader({ companies, userName, userRole }: { companies: PortalCompany[]; userName: string; userRole: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const isAssessorPlus = ["Admin", "Superuser", "Assessor"].includes(userRole);

  const requestedCompanyId = sp.get("companyId");
  const activeCompany = companies.find((c) => c.id === requestedCompanyId) ?? companies[0] ?? null;
  const showSelector = companies.length > 1;

  // ── Accent (--brand) — portal-only, cleaned up on unmount ────────────────
  const primaryColor = activeCompany?.primaryColor ?? null;
  useEffect(() => {
    const root = document.documentElement;
    if (primaryColor) {
      root.style.setProperty("--brand", primaryColor);
    } else {
      root.style.removeProperty("--brand");
    }
    return () => {
      root.style.removeProperty("--brand");
    };
  }, [primaryColor]);

  // ── Logo with silent text fallback (no broken image) ────────────────────
  const [logoFailed, setLogoFailed] = useState(false);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const logoUrl = activeCompany?.logoUrl ?? null;
  const companyId = activeCompany?.id ?? null;
  // Reset the fallback whenever the active company/logo changes.
  useEffect(() => {
    setLogoFailed(false);
  }, [companyId, logoUrl]);
  // Robust fallback driven by the image's own events (load clears, error sets).
  // A pre-hydration/a-synchronous completeness snapshot can mis-fire while a
  // good image is still decoding (complete=true with naturalWidth momentarily
  // 0), so the early-error catch is deferred long enough for a real image to
  // have decoded, and only fires for a genuinely failed/broken image.
  useEffect(() => {
    const img = logoRef.current;
    if (!img || !logoUrl) return;
    const onError = () => setLogoFailed(true);
    const onLoad = () => setLogoFailed(false);
    img.addEventListener("error", onError);
    img.addEventListener("load", onLoad);
    const t = setTimeout(() => {
      // `complete` true + zero naturalWidth ⇒ the browser finished fetching the
      // image but it failed to decode (404 / non-image). A good image decodes to
      // naturalWidth>0 well within this window, so this cannot false-positive.
      if (img.complete && img.naturalWidth === 0) setLogoFailed(true);
    }, 400);
    return () => {
      clearTimeout(t);
      img.removeEventListener("error", onError);
      img.removeEventListener("load", onLoad);
    };
  }, [logoUrl]);

  const showLogo = !!activeCompany?.logoUrl && !logoFailed;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={logoRef}
                src={activeCompany!.logoUrl!}
                alt={`${activeCompany!.companyName} logo`}
                className="h-9 w-auto max-w-40 object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="text-lg font-bold text-slate-900">Client Portal</span>
            )}
            {showSelector && activeCompany ? (
              <select
                aria-label="Portal company"
                className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
                defaultValue={activeCompany.id}
                onChange={(e) => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("companyId", e.target.value);
                  window.location.href = url.toString();
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            ) : activeCompany ? (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700">{activeCompany.companyName}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {isAssessorPlus ? (
              <Link href="/fla" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                App
              </Link>
            ) : null}
            <span className="text-sm text-slate-600">{userName}</span>
            <SignOutButton />
          </div>
        </div>
        <nav aria-label="Portal navigation" className="mt-3 flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? "text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                style={active ? { backgroundColor: "var(--brand, #1e40af)" } : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
          {userRole === "Admin" ? (
            <Link
              href="/portal/settings"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                pathname.startsWith("/portal/settings")
                  ? "text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
              style={pathname.startsWith("/portal/settings") ? { backgroundColor: "var(--brand, #1e40af)" } : undefined}
            >
              Settings
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
