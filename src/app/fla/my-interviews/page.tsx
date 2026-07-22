import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MyInterviewsClient } from "@/components/MyInterviewsClient";

export const dynamic = "force-dynamic";

export default async function MyInterviewsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <MyInterviewsClient />
  );
}
