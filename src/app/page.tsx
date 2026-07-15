import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSetupNeeded } from "@/lib/services/admin";
import { StartScreen } from "@/components/start-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Start" };

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // First run: send the admin straight to the setup wizard.
  if (session.user.role === "ADMIN" && (await isSetupNeeded())) {
    redirect("/admin/setup");
  }

  return (
    <StartScreen
      name={session.user.name ?? session.user.email}
      role={session.user.role}
    />
  );
}
