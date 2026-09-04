import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolvePortalCompanyId, type PortalCompany } from "@/lib/portal";

export type PortalContext = {
  userId: string;
  userName: string;
  userRole: string;
  providerRole: string | null;
  companyId: string | null; // null → no-company empty state
  companies: PortalCompany[];
};

export type PortalPageSearchParams = Promise<{ companyId?: string }>;

/** Shared server context for portal pages: session + scoped company resolution. */
export async function getPortalContext(searchParams?: PortalPageSearchParams): Promise<PortalContext> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = (session.user as { id?: string }).id as string;
  const userName = (session.user as { name?: string }).name ?? "Client";
  const userRole = (session.user as { role?: string }).role ?? "Assessor";
  const providerRole = (session.user as { providerRole?: string | null }).providerRole ?? null;

  const sp = await searchParams;
  const cookieStore = await cookies();
  const cookieCompanyId = cookieStore.get("selectedCompanyId")?.value ?? null;
  const { companyId, companies } = await resolvePortalCompanyId({
    userId,
    providerRole,
    selectedCompanyId: sp?.companyId ?? null,
    cookieCompanyId,
  });

  return { userId, userName, userRole, providerRole, companyId, companies };
}
