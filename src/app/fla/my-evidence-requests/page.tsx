import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MyEvidenceRequestsClient } from "@/components/MyEvidenceRequestsClient";

export const dynamic = "force-dynamic";

export default async function MyEvidenceRequestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <MyEvidenceRequestsClient />;
}
