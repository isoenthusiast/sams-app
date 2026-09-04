import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authz";
import { sessionUserId } from "@/lib/conversation";
import { resolvePortalCompanyId } from "@/lib/portal";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Settled decision #1: exact #RRGGBB, validated at the write route. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Settled decision #1 / negative path: portal logo URL must be https. */
const HTTPS_URL = /^https:\/\/\S+$/i;

/**
 * PATCH /api/portal/company/theme
 *
 * SAMS-010 white-label theming — the ONLY portal write for this feature. Manages
 * the active company's `logoUrl` + `primaryColor` (both additive nullable):
 *   - client Admin only (role === "Admin"); other roles → 403.
 *   - SCOPE-BY-CONSTRUCTION: the target company is the session user's ACTIVE
 *     portal company, resolved exactly like the portal pages (via
 *     resolvePortalCompanyId). A client-supplied companyId is never trusted —
 *     so a company-A Admin cannot theme company B, and no cross-tenant write
 *     is possible. A client Admin of the platform (role Admin, no portal company
 *     membership) gets 400 (no active company), matching "provider sets via the
 *     operator app" being a separate path.
 *   - Negative paths: invalid hex → 422; non-https logo URL → 422.
 *   - Body: `{ logoUrl?, primaryColor? }` — empty/null clears that field;
 *     `{ clear: true }` clears both (reverts to SAMS default).
 */
export async function PATCH(request: Request) {
  const { session, response } = await requireAuth();
  if (response) return response;

  const userId = sessionUserId(session) || "";
  const role = (session.user as { role?: string })?.role ?? "";

  // (b) client Admin only.
  if (role !== "Admin") {
    return NextResponse.json({ error: "Client Admin access required to manage theme" }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve the active portal company from the session (query/cookie/home/first),
  // exactly as the portal pages do. Never from the body.
  const url = new URL(request.url);
  const spCompanyId = url.searchParams.get("companyId");
  const cookieStore = await cookies();
  const cookieCompanyId = cookieStore.get("selectedCompanyId")?.value ?? null;
  const providerRole = (session.user as { providerRole?: string | null })?.providerRole ?? null;

  const { companyId } = await resolvePortalCompanyId({
    userId,
    providerRole,
    selectedCompanyId: spCompanyId,
    cookieCompanyId,
  });
  if (!companyId) {
    return NextResponse.json({ error: "No active portal company to theme" }, { status: 400 });
  }

  const clearAll = body.clear === true;
  // Build the update CONDITIONALLY (Conan round-1 finding #2): a PATCH that
  // omits a field must NOT wipe an existing value. Only keys present in the body
  // are written; an explicit null/"" clears THAT field; {clear:true} clears both
  // (reverts to the SAMS default).
  const data: { logoUrl?: string | null; primaryColor?: string | null } = {};
  if (clearAll) {
    data.logoUrl = null;
    data.primaryColor = null;
  } else {
    if (body.logoUrl !== undefined) {
      if (body.logoUrl === null || body.logoUrl === "") {
        data.logoUrl = null; // explicit clear of the logo field
      } else {
        const trimmed = String(body.logoUrl).trim();
        if (!HTTPS_URL.test(trimmed)) {
          return NextResponse.json({ error: "logoUrl must be an https URL" }, { status: 422 });
        }
        data.logoUrl = trimmed;
      }
    }
    if (body.primaryColor !== undefined) {
      if (body.primaryColor === null || body.primaryColor === "") {
        data.primaryColor = null; // explicit clear of the colour field
      } else {
        const trimmed = String(body.primaryColor).trim();
        if (!HEX_COLOR.test(trimmed)) {
          return NextResponse.json(
            { error: "primaryColor must be a #RRGGBB hex value" },
            { status: 422 }
          );
        }
        data.primaryColor = trimmed;
      }
    }
  }

  let company;
  try {
    // Empty PATCH body ({}): no-op — return the current theme without writing,
    // so nothing is accidentally cleared by a field-less update.
    if (Object.keys(data).length === 0) {
      company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, companyID: true, companyName: true, logoUrl: true, primaryColor: true },
      });
      if (!company) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }
      return NextResponse.json({ company });
    }
    company = await prisma.company.update({
      where: { id: companyId },
      data,
      select: { id: true, companyID: true, companyName: true, logoUrl: true, primaryColor: true },
    });
  } catch (error) {
    console.error("Error updating company theme:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ company });
}
