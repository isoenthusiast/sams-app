import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Role-based landing: Admin → /admin, everyone else → /fla
  const role = (session.user as { role?: string }).role;
  redirect(role === "Admin" ? "/admin" : "/fla");
}
