import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // SAMS-005 landing rule (settled decision #6): client-company users (no
  // providerRole) land on the Client Portal — the primary client interface.
  // Provider staff and role-based users keep their existing targets.
  const role = (session.user as { role?: string }).role;
  const providerRole = (session.user as { providerRole?: string | null }).providerRole;
  if (!providerRole) redirect("/portal");
  redirect(role === "Admin" ? "/admin" : "/fla");
}
